package authpolicy

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func fenceDB(t *testing.T) (*gorm.DB, *gorm.DB) {
	t.Helper()
	dsn := filepath.Join(t.TempDir(), "fence.db")
	open := func() *gorm.DB {
		db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
		require.NoError(t, err)
		pool, _ := db.DB()
		pool.SetMaxOpenConns(1)
		t.Cleanup(func() { _ = pool.Close() })
		return db
	}
	a, b := open(), open()
	require.NoError(t, a.Exec("CREATE TABLE auth_policy_fence (id INTEGER PRIMARY KEY, revision BIGINT NOT NULL)").Error)
	require.NoError(t, a.Exec("INSERT INTO auth_policy_fence VALUES (1,1)").Error)
	return a, b
}

func TestFenceRollbackAndMissingRow(t *testing.T) {
	db, _ := fenceDB(t)
	failure := errors.New("callback failed")
	require.ErrorIs(t, withWrite(context.Background(), db, func(tx *gorm.DB) error { return failure }), failure)
	var revision int
	require.NoError(t, db.Table("auth_policy_fence").Select("revision").Scan(&revision).Error)
	require.Equal(t, 1, revision)
	require.NoError(t, withWrite(context.Background(), db, func(tx *gorm.DB) error { return nil }))
	require.NoError(t, db.Table("auth_policy_fence").Select("revision").Scan(&revision).Error)
	require.Equal(t, 2, revision)
	require.NoError(t, db.Exec("DELETE FROM auth_policy_fence").Error)
	called := false
	require.Error(t, withWrite(context.Background(), db, func(tx *gorm.DB) error { called = true; return nil }))
	require.False(t, called)
}

func TestCancellationDoesNotReleaseOngoingCallback(t *testing.T) {
	a, b := fenceDB(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	entered, release := make(chan struct{}), make(chan struct{})
	done := make(chan error, 1)
	go func() { done <- withWrite(ctx, a, func(tx *gorm.DB) error { close(entered); <-release; return nil }) }()
	<-entered
	cancel()
	blockedCtx, blockedCancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer blockedCancel()
	called := false
	require.ErrorIs(t, withWrite(blockedCtx, b, func(tx *gorm.DB) error { called = true; return nil }), context.DeadlineExceeded)
	require.False(t, called)
	close(release)
	require.ErrorIs(t, <-done, context.Canceled)
	require.NoError(t, withWrite(context.Background(), b, func(tx *gorm.DB) error { return nil }))
}

func TestFenceNeverRetriesCallback(t *testing.T) {
	db, _ := fenceDB(t)
	calls := 0
	require.Error(t, withWrite(context.Background(), db, func(tx *gorm.DB) error { calls++; return errors.New("database is locked") }))
	require.Equal(t, 1, calls)
}
