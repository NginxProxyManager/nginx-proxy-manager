package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"npm/internal/config"
	"npm/internal/database"
	"npm/internal/entity/session"
	"npm/internal/entity/sso"
	"npm/internal/entity/user"
	njwt "npm/internal/jwt"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestSSOAdminRoutesRequireSettingsCapability(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(t.TempDir()+"/sso-access.db"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&user.Model{}, &user.HasCapabilityModel{}, &session.Model{}, &sso.Policy{}, &sso.Connection{}, &sso.AllowlistEntry{}, &njwt.KeysModel{}))
	require.NoError(t, db.Exec("CREATE TABLE auth_policy_fence (id INTEGER PRIMARY KEY, revision BIGINT NOT NULL)").Error)
	require.NoError(t, db.Exec("INSERT INTO auth_policy_fence VALUES (1,1)").Error)
	require.NoError(t, db.Create(&sso.Policy{ID: 1, Mode: sso.Parallel, Revision: 1}).Error)
	connectionID := strings.Repeat("Z", 43)
	require.NoError(t, db.Create(&sso.Connection{ID: connectionID, Protocol: sso.OIDC, Name: "Fixture", Revision: 1, ConfigJSON: `{"issuer_url":"https://id.example","client_id":"npm","email_claim":"email"}`}).Error)
	database.SetDB(db)
	oldSetup := config.IsSetup
	config.IsSetup = true
	t.Cleanup(func() { config.IsSetup = oldSetup; database.SetDB(nil) })
	require.NoError(t, njwt.LoadKeys())

	tokens := map[string]string{}
	for i, role := range []string{"pending", "insufficient", "settings", "admin"} {
		account := user.Model{Name: role, Email: role + "@example.com"}
		require.NoError(t, db.Create(&account).Error)
		switch role {
		case "insufficient":
			require.NoError(t, db.Create(&user.HasCapabilityModel{UserID: account.ID, CapabilityName: user.CapabilityHostsView}).Error)
		case "settings":
			require.NoError(t, db.Create(&user.HasCapabilityModel{UserID: account.ID, CapabilityName: user.CapabilitySettingsManage}).Error)
		case "admin":
			require.NoError(t, db.Create(&user.HasCapabilityModel{UserID: account.ID, CapabilityName: user.CapabilityFullAdmin}).Error)
		}
		id := strings.Repeat(string(rune('A'+i)), 43)
		require.NoError(t, db.Create(&session.Model{ID: id, UserID: account.ID, Source: session.Local, CreatedAt: time.Now().Add(-time.Minute), ExpiresAt: time.Now().Add(time.Hour)}).Error)
		issued, err := njwt.GenerateForSession(account.ID, id, false)
		require.NoError(t, err)
		tokens[role] = issued.Token
	}
	router := NewRouter()
	routes := []struct {
		method, path, body string
		allowedStatus      int
	}{
		{"POST", "/api/sso/saml/metadata-preview", "{}", 400},
		{"GET", "/api/sso/policy", "", 200}, {"PUT", "/api/sso/policy", "{}", 400},
		{"GET", "/api/sso/connections", "", 200}, {"POST", "/api/sso/connections", "{}", 400},
		{"GET", "/api/sso/connections/" + connectionID, "", 200}, {"PUT", "/api/sso/connections/" + connectionID, "{}", 400},
		{"DELETE", "/api/sso/connections/" + connectionID, "{}", 400}, {"POST", "/api/sso/connections/" + connectionID + "/test", "", 501},
		{"GET", "/api/sso/allowlist", "", 200}, {"PUT", "/api/sso/allowlist", "{}", 400},
	}
	for _, route := range routes {
		for _, role := range []string{"anonymous", "pending", "insufficient", "settings", "admin"} {
			req := httptest.NewRequest(route.method, route.path, strings.NewReader(route.body))
			if role != "anonymous" {
				req.Header.Set("Authorization", "Bearer "+tokens[role])
			}
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)
			switch role {
			case "anonymous":
				require.Equal(t, http.StatusUnauthorized, rec.Code, route.method+" "+route.path)
			case "pending", "insufficient":
				require.Equal(t, http.StatusForbidden, rec.Code, route.method+" "+route.path+" "+role)
			default:
				require.Equal(t, route.allowedStatus, rec.Code, route.method+" "+route.path+" "+role+": "+rec.Body.String())
			}
		}
	}
}
