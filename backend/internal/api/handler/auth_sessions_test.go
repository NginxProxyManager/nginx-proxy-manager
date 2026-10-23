package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/jwtauth/v5"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	"npm/internal/api/middleware"
	"npm/internal/authpolicy"
	"npm/internal/config"
	"npm/internal/database"
	"npm/internal/entity/auth"
	"npm/internal/entity/session"
	"npm/internal/entity/sso"
	"npm/internal/entity/user"
)

func authSessionFixture(t *testing.T) (*gorm.DB, string) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "auth.db")), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&user.Model{}, &user.HasCapabilityModel{}, &session.Model{}))
	require.NoError(t, db.Exec("CREATE TABLE auth_policy_fence (id INTEGER PRIMARY KEY, revision BIGINT NOT NULL)").Error)
	require.NoError(t, db.Exec("INSERT INTO auth_policy_fence VALUES (1,1)").Error)
	database.SetDB(db)
	setup := config.IsSetup
	config.IsSetup = true
	t.Cleanup(func() { config.IsSetup = setup; database.SetDB(nil) })
	account := user.Model{Name: "Admin", Email: "admin@example.com"}
	require.NoError(t, db.Create(&account).Error)
	require.NoError(t, db.Create(&user.HasCapabilityModel{UserID: account.ID, CapabilityName: user.CapabilityFullAdmin}).Error)
	id := strings.Repeat("b", 43)
	require.NoError(t, db.Create(&session.Model{ID: id, UserID: account.ID, Source: session.Local, CreatedAt: time.Now().Add(-time.Minute), ExpiresAt: time.Now().Add(time.Hour)}).Error)
	return db, id
}

func authSessionRequest(t *testing.T, id string, endpoint http.Handler) int {
	t.Helper()
	auth := jwtauth.New("HS256", []byte("test-only-secret"), nil)
	_, token, err := auth.Encode(map[string]any{"uid": 1, "sid": id, "iss": "api"})
	require.NoError(t, err)
	r := httptest.NewRequest(http.MethodPost, "/api/auth/logout", nil)
	r.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	jwtauth.Verify(auth, jwtauth.TokenFromHeader)(middleware.EnforceSessionOnly()(endpoint)).ServeHTTP(w, r)
	return w.Code
}

func TestLogoutInvalidatesOldJWT(t *testing.T) {
	_, id := authSessionFixture(t)
	require.Equal(t, 200, authSessionRequest(t, id, Logout()))
	require.Equal(t, 401, authSessionRequest(t, id, Logout()))
}

func TestExpiredSessionCannotRefresh(t *testing.T) {
	db, id := authSessionFixture(t)
	require.NoError(t, db.Model(&session.Model{}).Where("id = ?", id).Update("expires_at", time.Now().Add(-time.Second)).Error)
	require.Equal(t, 401, authSessionRequest(t, id, http.HandlerFunc(RefreshToken())))
}

func TestSSOOnlyRejectsPasswordSessionWithoutFullAdminFlag(t *testing.T) {
	db, _ := authSessionFixture(t)
	require.NoError(t, db.AutoMigrate(&sso.Policy{}))
	require.NoError(t, db.Create(&sso.Policy{ID: 1, Mode: sso.SSOOnly}).Error)
	account := user.Model{}
	require.NoError(t, db.First(&account, 1).Error)
	_, err := createLoginSession(t.Context(), account, session.Local)
	require.ErrorIs(t, err, session.ErrUnauthorized)
	var count int64
	require.NoError(t, db.Model(&session.Model{}).Count(&count).Error)
	require.EqualValues(t, 1, count)
}

func TestImpersonationRejectsPendingTarget(t *testing.T) {
	db, id := authSessionFixture(t)
	target := user.Model{Name: "Pending", Email: "pending@example.com"}
	require.NoError(t, db.Create(&target).Error)
	auth := jwtauth.New("HS256", []byte("test-only-secret"), nil)
	_, token, err := auth.Encode(map[string]any{"uid": 1, "sid": id, "iss": "api"})
	require.NoError(t, err)
	r := httptest.NewRequest(http.MethodPost, "/api/users/2/login", nil)
	r.Header.Set("Authorization", "Bearer "+token)
	ctx := chi.NewRouteContext()
	ctx.URLParams.Add("userID", "2")
	r = r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, ctx))
	w := httptest.NewRecorder()
	jwtauth.Verify(auth, jwtauth.TokenFromHeader)(middleware.Enforce(user.CapabilityUsersManage)(Impersonate())).ServeHTTP(w, r)
	require.Equal(t, http.StatusForbidden, w.Code)
}

func TestPasswordAdmissionModesAndAdministratorFlag(t *testing.T) {
	for _, tc := range []struct {
		name      string
		mode      sso.LoginMode
		fullAdmin bool
		flag      bool
		origin    string
		allowed   bool
	}{
		{"parallel ordinary local", sso.Parallel, false, false, "local", true},
		{"parallel ordinary ldap", sso.Parallel, false, false, "ldap", true},
		{"parallel admin flag disabled", sso.Parallel, true, false, "local", false},
		{"parallel admin flag enabled", sso.Parallel, true, true, "local", true},
		{"sso only ordinary", sso.SSOOnly, false, true, "local", false},
		{"sso only admin flag disabled", sso.SSOOnly, true, false, "local", false},
		{"sso only admin flag enabled", sso.SSOOnly, true, true, "local", true},
		{"parallel sso origin", sso.Parallel, false, false, "sso", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			db, _ := authSessionFixture(t)
			require.NoError(t, db.AutoMigrate(&sso.Policy{}))
			require.NoError(t, db.Create(&sso.Policy{ID: 1, Mode: tc.mode}).Error)
			require.NoError(t, db.Model(&user.Model{}).Where("id = ?", 1).Updates(map[string]any{"admin_password_enabled": tc.flag, "credential_origin": tc.origin}).Error)
			if !tc.fullAdmin {
				require.NoError(t, db.Where("user_id = ?", 1).Delete(&user.HasCapabilityModel{}).Error)
			}
			var account user.Model
			require.NoError(t, db.First(&account, 1).Error)
			var admissionErr error
			require.NoError(t, authpolicy.WithWrite(t.Context(), func(tx *gorm.DB) error {
				admissionErr = checkPasswordAdmission(tx, account)
				return nil
			}))
			if tc.allowed {
				require.NoError(t, admissionErr)
			} else {
				require.ErrorIs(t, admissionErr, session.ErrUnauthorized)
			}
		})
	}
}

func TestLDAPAttachmentRejectsSSOOriginWithoutCredentialOrSession(t *testing.T) {
	db, _ := authSessionFixture(t)
	require.NoError(t, db.AutoMigrate(&sso.Policy{}, &auth.Model{}))
	require.NoError(t, db.Create(&sso.Policy{ID: 1, Mode: sso.Parallel}).Error)
	account := user.Model{Name: "SSO", Email: "sso@example.com", CredentialOrigin: "sso"}
	require.NoError(t, db.Create(&account).Error)
	_, err := attachLDAPCredential(t.Context(), account.ID, "ldap-sso")
	require.ErrorIs(t, err, session.ErrUnauthorized)
	var credentialCount, sessionCount int64
	require.NoError(t, db.Model(&auth.Model{}).Where("user_id = ?", account.ID).Count(&credentialCount).Error)
	require.NoError(t, db.Model(&session.Model{}).Where("user_id = ?", account.ID).Count(&sessionCount).Error)
	require.Zero(t, credentialCount)
	require.Zero(t, sessionCount)
}

func TestLDAPAttachmentAllowsOrdinaryParallelAccount(t *testing.T) {
	db, _ := authSessionFixture(t)
	require.NoError(t, db.AutoMigrate(&sso.Policy{}, &auth.Model{}))
	require.NoError(t, db.Create(&sso.Policy{ID: 1, Mode: sso.Parallel}).Error)
	account := user.Model{Name: "LDAP", Email: "ldap@example.com", CredentialOrigin: "ldap"}
	require.NoError(t, db.Create(&account).Error)
	credential, err := attachLDAPCredential(t.Context(), account.ID, "ldap-ordinary")
	require.NoError(t, err)
	require.Equal(t, account.ID, credential.UserID)
	var count int64
	require.NoError(t, db.Model(&auth.Model{}).Where("user_id = ? AND type = ?", account.ID, auth.TypeLDAP).Count(&count).Error)
	require.EqualValues(t, 1, count)
}
