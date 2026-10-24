package session

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"npm/internal/authpolicy"
	"npm/internal/database"
	"npm/internal/entity/sso"
	"npm/internal/entity/user"
)

// External tests use disposable fixtures, never the application's database.
// PostgreSQL creates a private schema. MYSQL DSN must name npm_sso_task3_*.
func engineFixture(t *testing.T, engine string) *gorm.DB {
	t.Helper()
	if engine == "sqlite" {
		return fixture(t)
	}
	dsn := os.Getenv("SSO_TEST_" + strings.ToUpper(engine) + "_DSN")
	if dsn == "" {
		t.Skip("external engine DSN not set")
	}
	cfg := &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)}
	var db *gorm.DB
	var err error
	if engine == "postgres" {
		admin, openErr := gorm.Open(postgres.Open(dsn), cfg)
		require.NoError(t, openErr)
		schema := fmt.Sprintf("npm_sso_task3_%d", time.Now().UnixNano())
		require.NoError(t, admin.Exec("CREATE SCHEMA "+schema).Error)
		t.Cleanup(func() {
			require.NoError(t, admin.Exec("DROP SCHEMA "+schema+" CASCADE").Error)
			pool, _ := admin.DB()
			_ = pool.Close()
		})
		db, err = gorm.Open(postgres.Open(dsn+" search_path="+schema), cfg)
	} else {
		db, err = gorm.Open(mysql.Open(dsn), cfg)
		require.NoError(t, err)
		var name string
		require.NoError(t, db.Raw("SELECT DATABASE()").Scan(&name).Error)
		require.True(t, strings.HasPrefix(name, "npm_sso_task3_"), "MySQL requires a disposable npm_sso_task3_ database")
	}
	require.NoError(t, err)
	pool, err := db.DB()
	require.NoError(t, err)
	pool.SetMaxOpenConns(4)
	models := []any{&Model{}, &user.Model{}, &user.HasCapabilityModel{}, &sso.Connection{}, &sso.AllowlistEntry{}}
	t.Cleanup(func() {
		database.SetDB(nil)
		if engine == "mysql" {
			require.NoError(t, db.Migrator().DropTable(models...))
			require.NoError(t, db.Migrator().DropTable("auth_policy_fence"))
		}
		_ = pool.Close()
	})
	require.NoError(t, db.AutoMigrate(models...))
	require.NoError(t, db.Exec("CREATE TABLE auth_policy_fence (id BIGINT PRIMARY KEY, revision BIGINT NOT NULL)").Error)
	require.NoError(t, db.Exec("INSERT INTO auth_policy_fence VALUES (1,1)").Error)
	database.SetDB(db)
	seed(t, db)
	return db
}

type attemptKey struct{}

// The barrier fires when the contender actually reaches its fence UPDATE,
// rather than relying on a scheduler delay to infer that it attempted the lock.
func attemptBarrier(t *testing.T, db *gorm.DB) (context.Context, <-chan struct{}) {
	t.Helper()
	attempted := make(chan struct{})
	var once atomic.Bool
	hook := func(tx *gorm.DB) {
		if (tx.Statement.Table == "auth_policy_fence" || tx.Statement.SQL.String() == "BEGIN IMMEDIATE") && tx.Statement.Context.Value(attemptKey{}) != nil && once.CompareAndSwap(false, true) {
			close(attempted)
		}
	}
	require.NoError(t, db.Callback().Update().Before("gorm:update").Register("test:fence_attempt", hook))
	require.NoError(t, db.Callback().Raw().Before("gorm:raw").Register("test:fence_attempt", hook))
	t.Cleanup(func() {
		_ = db.Callback().Update().Remove("test:fence_attempt")
		_ = db.Callback().Raw().Remove("test:fence_attempt")
	})
	return context.WithValue(context.Background(), attemptKey{}, true), attempted
}

func receive(t *testing.T, ch <-chan error) error {
	t.Helper()
	select {
	case err := <-ch:
		return err
	case <-time.After(5 * time.Second):
		t.Fatal("concurrent operation did not finish")
		return nil
	}
}
func barrier(t *testing.T, ch <-chan struct{}) {
	t.Helper()
	select {
	case <-ch:
	case <-time.After(5 * time.Second):
		t.Fatal("barrier not reached")
	}
}

func liveSession(t *testing.T, db *gorm.DB, source Source) Model {
	t.Helper()
	m := value("a", source)
	m.CreatedAt = time.Now().UTC()
	m.ExpiresAt = m.CreatedAt.Add(time.Hour)
	require.NoError(t, db.Create(&m).Error)
	return m
}

func TestCrossConnectionOrdering(t *testing.T) {
	for _, engine := range []string{"sqlite", "postgres", "mysql"} {
		t.Run(engine, func(t *testing.T) {
			t.Run("event before revoke", func(t *testing.T) {
				db := engineFixture(t, engine)
				m := liveSession(t, db, SSO)
				ctx, attempted := attemptBarrier(t, db)
				entered, release := make(chan struct{}), make(chan struct{})
				written := atomic.Bool{}
				delivery, revoke := make(chan error, 1), make(chan error, 1)
				go func() {
					delivery <- WithAuthorizedDelivery(context.Background(), m.ID, func(p Principal) error { close(entered); <-release; written.Store(true); return nil })
				}()
				barrier(t, entered)
				go func() {
					err := Revoke(ctx, m.ID, time.Now())
					if err == nil && !written.Load() {
						err = errors.New("revoke committed before protected write finished")
					}
					revoke <- err
				}()
				barrier(t, attempted)
				close(release)
				require.NoError(t, receive(t, delivery))
				require.NoError(t, receive(t, revoke))
				called := false
				require.ErrorIs(t, WithAuthorizedDelivery(context.Background(), m.ID, func(Principal) error { called = true; return nil }), ErrUnauthorized)
				require.False(t, called)
			})
			t.Run("revoke before event", func(t *testing.T) {
				db := engineFixture(t, engine)
				m := liveSession(t, db, SSO)
				ctx, attempted := attemptBarrier(t, db)
				entered, release := make(chan struct{}), make(chan struct{})
				revoked, delivery := make(chan error, 1), make(chan error, 1)
				go func() {
					revoked <- sso.WithPolicyWrite(context.Background(), func(tx *gorm.DB) error {
						if err := RevokeMatching(tx, RevocationFilter{SessionID: m.ID}, time.Now()); err != nil {
							return err
						}
						close(entered)
						<-release
						return nil
					})
				}()
				barrier(t, entered)
				var called atomic.Bool
				go func() {
					delivery <- WithAuthorizedDelivery(ctx, m.ID, func(Principal) error { called.Store(true); return nil })
				}()
				barrier(t, attempted)
				close(release)
				require.NoError(t, receive(t, revoked))
				require.ErrorIs(t, receive(t, delivery), ErrUnauthorized)
				require.False(t, called.Load())
			})
			t.Run("callback admission versus revoke", func(t *testing.T) {
				db := engineFixture(t, engine)
				ctx, attempted := attemptBarrier(t, db)
				entered, release := make(chan struct{}), make(chan struct{})
				mutation, admission := make(chan error, 1), make(chan error, 1)
				go func() {
					mutation <- sso.WithPolicyWrite(context.Background(), func(tx *gorm.DB) error {
						if err := tx.Delete(&sso.AllowlistEntry{}, "email = ?", "admin@example.com").Error; err != nil {
							return err
						}
						if err := RevokeMatching(tx, RevocationFilter{LoginEmail: "admin@example.com"}, time.Now()); err != nil {
							return err
						}
						close(entered)
						<-release
						return nil
					})
				}()
				barrier(t, entered)
				go func() {
					admission <- sso.WithPolicyWrite(ctx, func(tx *gorm.DB) error { return Create(tx, value("a", SSO)) })
				}()
				barrier(t, attempted)
				close(release)
				require.NoError(t, receive(t, mutation))
				require.ErrorIs(t, receive(t, admission), ErrUnauthorized)
				var count int64
				require.NoError(t, db.Model(&Model{}).Count(&count).Error)
				require.Zero(t, count)
			})
			t.Run("admission before removal", func(t *testing.T) {
				db := engineFixture(t, engine)
				ctx, attempted := attemptBarrier(t, db)
				entered, release := make(chan struct{}), make(chan struct{})
				admission, mutation := make(chan error, 1), make(chan error, 1)
				m := value("a", SSO)
				go func() {
					admission <- sso.WithPolicyWrite(context.Background(), func(tx *gorm.DB) error {
						if err := Create(tx, m); err != nil {
							return err
						}
						close(entered)
						<-release
						return nil
					})
				}()
				barrier(t, entered)
				go func() {
					mutation <- sso.WithPolicyWrite(ctx, func(tx *gorm.DB) error {
						if err := tx.Delete(&sso.AllowlistEntry{}, "email = ?", m.LoginEmail).Error; err != nil {
							return err
						}
						return RevokeMatching(tx, RevocationFilter{LoginEmail: m.LoginEmail}, epoch)
					})
				}()
				barrier(t, attempted)
				close(release)
				require.NoError(t, receive(t, admission))
				require.NoError(t, receive(t, mutation))
				require.NoError(t, db.Create(&sso.AllowlistEntry{Email: m.LoginEmail}).Error)
				_, err := Authorize(context.Background(), m.ID, epoch)
				require.ErrorIs(t, err, ErrUnauthorized)
			})
			t.Run("parent versus child", func(t *testing.T) {
				db := engineFixture(t, engine)
				parent := liveSession(t, db, Local)
				child := value("b", Impersonation)
				child.ParentID = parent.ID
				child.CreatedAt = parent.CreatedAt
				child.ExpiresAt = parent.ExpiresAt
				ctx, attempted := attemptBarrier(t, db)
				entered, release := make(chan struct{}), make(chan struct{})
				mutation, admission := make(chan error, 1), make(chan error, 1)
				go func() {
					mutation <- authpolicy.WithWrite(context.Background(), func(tx *gorm.DB) error {
						if err := RevokeMatching(tx, RevocationFilter{SessionID: parent.ID}, time.Now()); err != nil {
							return err
						}
						close(entered)
						<-release
						return nil
					})
				}()
				barrier(t, entered)
				go func() { admission <- authpolicy.WithWrite(ctx, func(tx *gorm.DB) error { return Create(tx, child) }) }()
				barrier(t, attempted)
				close(release)
				require.NoError(t, receive(t, mutation))
				require.ErrorIs(t, receive(t, admission), ErrUnauthorized)
			})
		})
	}
}

func TestFencedReadsAreCurrentAfterEarlierRead(t *testing.T) {
	for _, engine := range []string{"postgres", "mysql"} {
		t.Run(engine, func(t *testing.T) {
			db := engineFixture(t, engine)
			m := liveSession(t, db, Local)
			require.NoError(t, authpolicy.WithWrite(context.Background(), func(tx *gorm.DB) error {
				_, err := authorize(tx, m.ID, epoch)
				require.NoError(t, err)
				// This separate pool connection commits after the transaction's
				// first read, exposing an accidental MySQL repeatable-read snapshot.
				require.NoError(t, db.Model(&user.Model{}).Where("id = ?", m.UserID).Update("is_disabled", true).Error)
				_, err = authorize(tx, m.ID, epoch)
				require.ErrorIs(t, err, ErrUnauthorized)
				return nil
			}))
		})
	}
}
