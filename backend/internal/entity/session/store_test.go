package session

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"npm/internal/database"
	"npm/internal/entity/sso"
	"npm/internal/entity/user"
)

var epoch = time.Now().UTC()

func sid(c string) string { return strings.Repeat(c, 43) }

func fixture(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "session.db")), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&Model{}, &user.Model{}, &user.HasCapabilityModel{}, &sso.Connection{}, &sso.AllowlistEntry{}))
	require.NoError(t, db.Exec("CREATE TABLE auth_policy_fence (id INTEGER PRIMARY KEY, revision BIGINT NOT NULL)").Error)
	require.NoError(t, db.Exec("INSERT INTO auth_policy_fence VALUES (1,1)").Error)
	database.SetDB(db)
	t.Cleanup(func() { database.SetDB(nil); sqlDB, _ := db.DB(); _ = sqlDB.Close() })
	seed(t, db)
	return db
}

func seed(t *testing.T, db *gorm.DB) {
	t.Helper()
	u := user.Model{Name: "Admin", Email: "admin@example.com"}
	u.ID = 1
	require.NoError(t, db.Create(&u).Error)
	require.NoError(t, db.Create(&user.HasCapabilityModel{UserID: 1, CapabilityName: "full-admin"}).Error)
	require.NoError(t, db.Create(&sso.Connection{ID: sid("c"), Name: "Provider", Protocol: sso.OIDC, Enabled: true, Revision: 1}).Error)
	require.NoError(t, db.Create(&sso.AllowlistEntry{Email: "admin@example.com"}).Error)
}

func value(id string, source Source) Model {
	m := Model{ID: sid(id), UserID: 1, Source: source, CreatedAt: epoch, ExpiresAt: epoch.Add(time.Hour)}
	if source == SSO {
		m.ConnectionID = sid("c")
		m.LoginEmail = "admin@example.com"
	}
	return m
}

func TestAuthorizeCurrentPolicy(t *testing.T) {
	for _, tc := range []struct {
		name    string
		source  Source
		change  func(*gorm.DB, Model)
		allowed bool
	}{
		{"local", Local, nil, true}, {"ldap", LDAP, nil, true}, {"sso", SSO, nil, true},
		{"expired", Local, func(db *gorm.DB, m Model) { require.NoError(t, db.Model(&m).Update("expires_at", epoch).Error) }, false},
		{"revoked", SSO, func(db *gorm.DB, m Model) { require.NoError(t, db.Model(&m).Update("revoked_at", epoch).Error) }, false},
		{"disabled user", Local, func(db *gorm.DB, m Model) {
			require.NoError(t, db.Model(&user.Model{}).Where("id = ?", 1).Update("is_disabled", true).Error)
		}, false},
		{"removed email", SSO, func(db *gorm.DB, m Model) {
			require.NoError(t, db.Delete(&sso.AllowlistEntry{}, "email = ?", m.LoginEmail).Error)
		}, false},
		{"local survives removal", Local, func(db *gorm.DB, m Model) {
			require.NoError(t, db.Delete(&sso.AllowlistEntry{}, "email = ?", "admin@example.com").Error)
		}, true},
		{"disabled connection", SSO, func(db *gorm.DB, m Model) {
			require.NoError(t, db.Model(&sso.Connection{}).Where("id = ?", m.ConnectionID).Update("enabled", false).Error)
		}, false},
		{"display name", SSO, func(db *gorm.DB, m Model) {
			require.NoError(t, db.Model(&sso.Connection{}).Where("id = ?", m.ConnectionID).Update("name", "New name").Error)
		}, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			db := fixture(t)
			m := value("a", tc.source)
			require.NoError(t, db.Create(&m).Error)
			if tc.change != nil {
				tc.change(db, m)
			}
			p, err := Authorize(context.Background(), m.ID, epoch)
			if tc.allowed {
				require.NoError(t, err)
				require.Equal(t, []string{"full-admin"}, p.Capabilities)
			} else {
				require.ErrorIs(t, err, ErrUnauthorized)
			}
		})
	}
}

func TestCreateAndRevokeDescendants(t *testing.T) {
	db := fixture(t)
	root := value("a", SSO)
	child := value("b", Impersonation)
	child.ParentID = root.ID
	grandchild := value("d", Impersonation)
	grandchild.ParentID = child.ID
	local := value("e", Local)
	for _, m := range []Model{root, child, grandchild, local} {
		require.NoError(t, Create(db, m))
	}
	require.NoError(t, Revoke(context.Background(), root.ID, epoch))
	for _, m := range []Model{root, child, grandchild} {
		_, err := Authorize(context.Background(), m.ID, epoch)
		require.ErrorIs(t, err, ErrUnauthorized)
	}
	_, err := Authorize(context.Background(), local.ID, epoch)
	require.NoError(t, err)
}

func TestAuthorizeRejectsBrokenAncestors(t *testing.T) {
	for _, kind := range []string{"revoked", "expired", "disabled user", "missing", "cycle", "depth"} {
		t.Run(kind, func(t *testing.T) {
			db := fixture(t)
			parent := value("a", SSO)
			child := value("b", Impersonation)
			child.ParentID = parent.ID
			require.NoError(t, db.Create(&parent).Error)
			require.NoError(t, db.Create(&child).Error)
			switch kind {
			case "revoked":
				require.NoError(t, db.Model(&parent).Update("revoked_at", epoch).Error)
			case "expired":
				require.NoError(t, db.Model(&parent).Update("expires_at", epoch).Error)
			case "disabled user":
				require.NoError(t, db.Model(&user.Model{}).Where("id = 1").Update("is_disabled", true).Error)
			case "missing":
				require.NoError(t, db.Delete(&parent).Error)
			case "cycle":
				require.NoError(t, db.Model(&parent).Updates(map[string]any{"source": Impersonation, "parent_id": child.ID}).Error)
			case "depth":
				for i := 0; i < 40; i++ {
					next := value("f", Impersonation)
					next.ID = fmt.Sprintf("%043d", i)
					next.ParentID = child.ID
					require.NoError(t, db.Create(&next).Error)
					child = next
				}
			}
			_, err := Authorize(context.Background(), child.ID, epoch)
			require.ErrorIs(t, err, ErrUnauthorized)
		})
	}
}

func TestRevocationMutationPreservesOtherSourcesAndNeverRevives(t *testing.T) {
	for _, kind := range []string{"remove email", "disable connection", "sensitive edit", "delete connection"} {
		t.Run(kind, func(t *testing.T) {
			db := fixture(t)
			a := value("a", SSO)
			b := value("b", SSO)
			b.ConnectionID = sid("d")
			local := value("e", Local)
			ldap := value("f", LDAP)
			require.NoError(t, db.Create(&sso.Connection{ID: b.ConnectionID, Protocol: sso.OIDC, Enabled: true, Revision: 1}).Error)
			for _, m := range []Model{a, b, local, ldap} {
				require.NoError(t, db.Create(&m).Error)
			}
			require.NoError(t, sso.WithPolicyWrite(context.Background(), func(tx *gorm.DB) error {
				filter := RevocationFilter{ConnectionID: a.ConnectionID}
				switch kind {
				case "remove email":
					if err := tx.Delete(&sso.AllowlistEntry{}, "email = ?", a.LoginEmail).Error; err != nil {
						return err
					}
					filter = RevocationFilter{LoginEmail: a.LoginEmail}
				case "disable connection":
					if err := tx.Model(&sso.Connection{}).Where("id = ?", a.ConnectionID).Update("enabled", false).Error; err != nil {
						return err
					}
				case "sensitive edit":
					if err := tx.Model(&sso.Connection{}).Where("id = ?", a.ConnectionID).Updates(map[string]any{"config_json": "{\"issuer\":\"changed\"}", "revision": 2}).Error; err != nil {
						return err
					}
				case "delete connection":
					if err := tx.Delete(&sso.Connection{}, "id = ?", a.ConnectionID).Error; err != nil {
						return err
					}
				}
				return RevokeMatching(tx, filter, epoch)
			}))
			_, err := Authorize(context.Background(), a.ID, epoch)
			require.ErrorIs(t, err, ErrUnauthorized)
			_, err = Authorize(context.Background(), b.ID, epoch)
			if kind == "remove email" {
				require.ErrorIs(t, err, ErrUnauthorized)
			} else {
				require.NoError(t, err)
			}
			for _, m := range []Model{local, ldap} {
				_, err := Authorize(context.Background(), m.ID, epoch)
				require.NoError(t, err)
			}
			if kind == "remove email" {
				require.NoError(t, db.Create(&sso.AllowlistEntry{Email: a.LoginEmail}).Error)
			}
			if kind == "disable connection" {
				require.NoError(t, db.Model(&sso.Connection{}).Where("id = ?", a.ConnectionID).Update("enabled", true).Error)
			}
			_, err = Authorize(context.Background(), a.ID, epoch)
			require.ErrorIs(t, err, ErrUnauthorized)
		})
	}
}

func TestCapabilitiesAreFreshAndAbsentSessionFails(t *testing.T) {
	db := fixture(t)
	m := value("a", Local)
	require.NoError(t, Create(db, m))
	p, err := Authorize(context.Background(), m.ID, epoch)
	require.NoError(t, err)
	require.Equal(t, []string{"full-admin"}, p.Capabilities)
	require.NoError(t, db.Delete(&user.HasCapabilityModel{}, "user_id = ?", m.UserID).Error)
	p, err = Authorize(context.Background(), m.ID, epoch)
	require.NoError(t, err)
	require.Empty(t, p.Capabilities)
	_, err = Authorize(context.Background(), sid("z"), epoch)
	require.ErrorIs(t, err, ErrUnauthorized)
}

func TestCreateRejectsExpiredParentDespiteBackdatedCreationTime(t *testing.T) {
	db := fixture(t)
	parent := value("a", Local)
	parent.CreatedAt = epoch.Add(-2 * time.Hour)
	parent.ExpiresAt = epoch.Add(-time.Hour)
	require.NoError(t, db.Create(&parent).Error)
	child := value("b", Impersonation)
	child.ParentID = parent.ID
	child.CreatedAt = epoch.Add(-90 * time.Minute)
	require.ErrorIs(t, Create(db, child), ErrUnauthorized)
}

func TestRevokeMatchingValidatesFilterAndKeepsUnrelatedLocal(t *testing.T) {
	db := fixture(t)
	s := value("a", SSO)
	l := value("b", Local)
	require.NoError(t, db.Create(&s).Error)
	require.NoError(t, db.Create(&l).Error)
	for _, filter := range []RevocationFilter{{}, {SessionID: s.ID, ConnectionID: s.ConnectionID}, {LoginEmail: " "}} {
		require.Error(t, RevokeMatching(db, filter, epoch))
	}
	_, err := Authorize(context.Background(), s.ID, epoch)
	require.NoError(t, err)
	require.NoError(t, RevokeMatching(db, RevocationFilter{LoginEmail: s.LoginEmail}, epoch))
	_, err = Authorize(context.Background(), s.ID, epoch)
	require.ErrorIs(t, err, ErrUnauthorized)
	_, err = Authorize(context.Background(), l.ID, epoch)
	require.NoError(t, err)
}
