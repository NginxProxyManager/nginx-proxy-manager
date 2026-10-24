package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"npm/internal/config"
	"npm/internal/database"
	"npm/internal/entity"
	"npm/internal/entity/auth"
	"npm/internal/entity/session"
	"npm/internal/entity/user"
	njwt "npm/internal/jwt"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func userContractRouter(t *testing.T) (*gorm.DB, http.Handler, string) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(t.TempDir()+"/users.db"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&user.Model{}, &user.HasCapabilityModel{}, &entity.Capability{}, &auth.Model{}, &session.Model{}, &njwt.KeysModel{}))
	require.NoError(t, db.Exec("CREATE TABLE auth_policy_fence (id INTEGER PRIMARY KEY, revision BIGINT NOT NULL)").Error)
	require.NoError(t, db.Exec("INSERT INTO auth_policy_fence VALUES (1,1)").Error)
	for _, capability := range []string{user.CapabilityFullAdmin, user.CapabilityHostsView} {
		require.NoError(t, db.Create(&entity.Capability{Name: capability}).Error)
	}
	actor := user.Model{Name: "Admin", Email: "admin@example.test", CredentialOrigin: "local"}
	require.NoError(t, db.Create(&actor).Error)
	require.NoError(t, db.Create(&user.HasCapabilityModel{UserID: actor.ID, CapabilityName: user.CapabilityFullAdmin}).Error)
	sid := strings.Repeat("U", 43)
	require.NoError(t, db.Create(&session.Model{ID: sid, UserID: actor.ID, Source: session.Local, CreatedAt: time.Now().Add(-time.Minute), ExpiresAt: time.Now().Add(time.Hour)}).Error)
	database.SetDB(db)
	oldSetup := config.IsSetup
	config.IsSetup = true
	t.Cleanup(func() { config.IsSetup = oldSetup; database.SetDB(nil) })
	require.NoError(t, njwt.LoadKeys())
	issued, err := njwt.GenerateForSession(actor.ID, sid, false)
	require.NoError(t, err)
	return db, NewRouter(), issued.Token
}

func authenticatedJSONRequest(method, path, body, token string) *http.Request {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	return req
}

func TestUserRoutesAllowExplicitlyClearingCapabilitiesAndCreatingLocalZeroCapabilityUser(t *testing.T) {
	db, router, token := userContractRouter(t)
	target := user.Model{Name: "Target", Email: "target@example.test", CredentialOrigin: "local"}
	require.NoError(t, db.Create(&target).Error)
	require.NoError(t, db.Create(&user.HasCapabilityModel{UserID: target.ID, CapabilityName: user.CapabilityHostsView}).Error)

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, authenticatedJSONRequest(http.MethodPut, "/api/users/2", `{"capabilities":[]}`, token))
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"capabilities":[]`)
	var count int64
	require.NoError(t, db.Model(&user.HasCapabilityModel{}).Where("user_id = ?", target.ID).Count(&count).Error)
	require.Zero(t, count)

	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, authenticatedJSONRequest(http.MethodPost, "/api/users", `{"name":"Local Zero","email":"local-zero@example.test","is_disabled":false,"capabilities":[],"auth":{"type":"local","secret":"strong-passphrase"}}`, token))
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"capabilities":[]`)
	var created user.Model
	require.NoError(t, db.Where("email = ?", "local-zero@example.test").First(&created).Error)
	require.Equal(t, "local", created.CredentialOrigin, "normal admin creation must not manufacture an SSO-origin pending account")
	_, err := auth.GetByUserIDType(created.ID, auth.TypeLocal)
	require.NoError(t, err)
}

func TestSelfProfileRouteRejectsEveryPolicyAndCredentialField(t *testing.T) {
	_, router, token := userContractRouter(t)
	for field, value := range map[string]string{
		"capabilities":           `[]`,
		"is_disabled":            `true`,
		"password_login_enabled": `true`,
		"credential_origin":      `"local"`,
		"admin_password_enabled": `true`,
		"has_local_credential":   `true`,
		"can_set_local_password": `true`,
		"is_system":              `true`,
		"auth":                   `{}`,
	} {
		t.Run(field, func(t *testing.T) {
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, authenticatedJSONRequest(http.MethodPut, "/api/users/me", `{"`+field+`":`+value+`}`, token))
			require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
		})
	}
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, authenticatedJSONRequest(http.MethodPut, "/api/users/me", `{"name":"Renamed Admin"}`, token))
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
}
