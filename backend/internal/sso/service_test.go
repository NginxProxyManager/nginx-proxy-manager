package sso

import (
	"context"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	"npm/internal/config"
	"npm/internal/database"
	"npm/internal/entity/session"
	ssoconfig "npm/internal/entity/sso"
	"npm/internal/entity/user"
	"npm/internal/secretstore"
)

type fakeAdapter struct {
	identity Identity
	barrier  func()
	fail     bool
}

func (a *fakeAdapter) Start(_ context.Context, _ ssoconfig.Connection, t Transaction) (StartResult, error) {
	if t.PublicURL != "https://npm.example" {
		return StartResult{}, ErrDenied
	}
	return StartResult{RedirectURL: "https://idp.example/auth?state=" + t.State}, nil
}
func (a *fakeAdapter) Complete(_ context.Context, _ ssoconfig.Connection, t Transaction, r *http.Request) (Identity, error) {
	if a.barrier != nil {
		a.barrier()
	}
	if a.fail || t.PublicURL != "https://npm.example" || t.Nonce == "" || t.PKCEVerifier == "" || t.RequestID == "" {
		return Identity{}, ErrDenied
	}
	return a.identity, nil
}

type testFixture struct {
	db            *gorm.DB
	service       *Service
	adapter       *fakeAdapter
	now           time.Time
	conn, browser string
	key           *secretstore.Store
}

func token(c string) string {
	return base64.RawURLEncoding.EncodeToString([]byte(strings.Repeat(c, 32)))
}
func fixture(t *testing.T) *testFixture {
	t.Helper()
	db := serviceTestDB(t)
	require.NoError(t, db.AutoMigrate(&session.Model{}, &user.Model{}, &user.HasCapabilityModel{}, &ssoconfig.Connection{}, &ssoconfig.AllowlistEntry{}, &ssoconfig.Policy{}))
	for _, q := range []string{
		"CREATE UNIQUE INDEX active_email ON " + db.Statement.Quote("user") + "(normalized_email)",
		"CREATE TABLE auth_policy_fence (id INTEGER PRIMARY KEY, revision BIGINT NOT NULL)", "INSERT INTO auth_policy_fence VALUES(1,1)",
		"CREATE TABLE sso_transaction (id VARCHAR(43) PRIMARY KEY,connection_id VARCHAR(43),browser_hash VARCHAR(64),state_hash VARCHAR(64) UNIQUE,secret_ciphertext BLOB,connection_revision BIGINT,return_path TEXT,expires_at DATETIME,consumed_at DATETIME)",
		"CREATE TABLE sso_handoff (code_hash VARCHAR(64) PRIMARY KEY,browser_hash VARCHAR(64),connection_id VARCHAR(43),connection_revision BIGINT,user_id BIGINT,login_email VARCHAR(254),expires_at DATETIME,consumed_at DATETIME)",
		"CREATE TABLE sso_replay (id VARCHAR(64) PRIMARY KEY,connection_id VARCHAR(43),expires_at DATETIME)",
	} {
		if db.Dialector.Name() == "postgres" {
			q = strings.ReplaceAll(strings.ReplaceAll(q, " BLOB", " BYTEA"), " DATETIME", " TIMESTAMP")
		}
		if db.Dialector.Name() == "mysql" {
			q = strings.ReplaceAll(q, " DATETIME", " DATETIME(6)")
		}
		require.NoError(t, db.Exec(q).Error)
	}
	database.SetDB(db)
	old := config.IsSetup
	config.IsSetup = true
	t.Cleanup(func() { config.IsSetup = old; database.SetDB(nil) })
	key, err := secretstore.Open(t.TempDir())
	require.NoError(t, err)
	f := &testFixture{db: db, key: key, now: time.Now().UTC(), conn: token("c"), browser: token("b"), adapter: &fakeAdapter{identity: Identity{Email: "Allowed@Example.COM", Name: "Provider name"}}}
	require.NoError(t, db.Create(&ssoconfig.Connection{ID: f.conn, Protocol: ssoconfig.OIDC, Enabled: true, Revision: 1, Name: "Provider"}).Error)
	require.NoError(t, db.Create(&ssoconfig.Policy{ID: 1, Mode: ssoconfig.Parallel, PublicURL: "https://npm.example", Revision: 1}).Error)
	require.NoError(t, db.Create(&ssoconfig.AllowlistEntry{Email: "allowed@example.com"}).Error)
	f.service = NewService(db, key, map[ssoconfig.Protocol]Adapter{ssoconfig.OIDC: f.adapter}, WithClock(func() time.Time { return f.now }))
	return f
}
func (f *testFixture) begin(t *testing.T, browser string) (StartResult, *http.Request) {
	t.Helper()
	v, err := f.service.Begin(context.Background(), f.conn, browser, "/dashboard")
	require.NoError(t, err)
	u, err := url.Parse(v.RedirectURL)
	require.NoError(t, err)
	return v, httptest.NewRequest("GET", "https://npm.example/sso/callback?state="+u.Query().Get("state"), nil)
}
func (f *testFixture) complete(t *testing.T) string {
	t.Helper()
	_, r := f.begin(t, f.browser)
	code, err := f.service.Complete(context.Background(), f.conn, f.browser, r)
	require.NoError(t, err)
	return code
}
func TestAdmission(t *testing.T) {
	for _, kind := range []string{"new", "unlisted", "existing", "disabled", "system", "bootstrap"} {
		t.Run(kind, func(t *testing.T) {
			f := fixture(t)
			if kind == "unlisted" {
				f.adapter.identity.Email = "other@example.com"
			}
			if kind == "bootstrap" {
				config.IsSetup = false
				_, err := f.service.Begin(context.Background(), f.conn, f.browser, "/")
				require.ErrorIs(t, err, ErrDenied)
				return
			}
			if kind == "existing" || kind == "disabled" || kind == "system" {
				mail := "allowed@example.com"
				u := user.Model{Name: "Keep name", Email: "Allowed@Example.com", NormalizedEmail: &mail, IsDisabled: kind == "disabled", IsSystem: kind == "system",
					ID: 9}
				require.NoError(t, f.db.Create(&u).Error)
				require.NoError(t, f.db.Create(&user.HasCapabilityModel{UserID: 9, CapabilityName: "full-admin"}).Error)
			}
			_, r := f.begin(t, f.browser)
			code, err := f.service.Complete(context.Background(), f.conn, f.browser, r)
			if kind == "unlisted" || kind == "disabled" || kind == "system" {
				require.ErrorIs(t, err, ErrDenied)
				require.Empty(t, code)
				var n int64
				require.NoError(t, f.db.Model(&user.Model{}).Count(&n).Error)
				if kind == "unlisted" {
					require.Zero(t, n)
				}
				return
			}
			require.NoError(t, err)
			require.Len(t, code, 43)
			require.NotContains(t, code, ".")
			sess, err := f.service.Exchange(context.Background(), code, f.browser)
			require.NoError(t, err)
			require.Equal(t, session.SSO, sess.Source)
			require.Equal(t, "allowed@example.com", sess.LoginEmail)
			var u user.Model
			require.NoError(t, f.db.First(&u, sess.UserID).Error)
			var caps []string
			require.NoError(t, f.db.Model(&user.HasCapabilityModel{}).Where("user_id = ?", u.ID).Pluck("capability_name", &caps).Error)
			if kind == "existing" {
				require.Equal(t, uint(9), u.ID)
				require.Equal(t, "Keep name", u.Name)
				require.Equal(t, []string{"full-admin"}, caps)
			} else {
				require.Empty(t, caps)
				require.Equal(t, "sso", u.CredentialOrigin)
			}
		})
	}
}
