package api

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/go-chi/jwtauth/v5"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	"npm/internal/config"
	"npm/internal/database"
	"npm/internal/entity/auth"
	"npm/internal/entity/session"
	"npm/internal/entity/user"
)

func TestFiveStreamsDoNotStarveAuthenticatedAPI(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "router.db")), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&session.Model{}, &user.Model{}, &user.HasCapabilityModel{}, &auth.Model{}))
	require.NoError(t, db.Exec("CREATE TABLE auth_policy_fence (id INTEGER PRIMARY KEY, revision BIGINT NOT NULL)").Error)
	require.NoError(t, db.Exec("INSERT INTO auth_policy_fence VALUES (1,1)").Error)
	require.NoError(t, db.Create(&user.Model{Name: "Admin", Email: "admin@example.com"}).Error)
	require.NoError(t, db.Create(&user.HasCapabilityModel{UserID: 1, CapabilityName: "full-admin"}).Error)
	id := strings.Repeat("a", 43)
	require.NoError(t, db.Create(&session.Model{ID: id, UserID: 1, Source: session.Local, CreatedAt: time.Now(), ExpiresAt: time.Now().Add(time.Hour)}).Error)
	database.SetDB(db)
	previous := config.IsSetup
	config.IsSetup = true
	t.Cleanup(func() { config.IsSetup = previous; database.SetDB(nil); sqldb, _ := db.DB(); _ = sqldb.Close() })
	auth := jwtauth.New("HS256", []byte("test-key"), nil)
	_, sseToken, err := auth.Encode(map[string]any{"uid": 1, "sid": id, "iss": "sse"})
	require.NoError(t, err)
	_, apiToken, err := auth.Encode(map[string]any{"uid": 1, "sid": id, "iss": "api"})
	require.NoError(t, err)
	// Exact production routes and common middleware; only the signing key is test-local.
	srv := httptest.NewServer(applyRoutes(newBaseRouter(jwtauth.Verify(auth, jwtauth.TokenFromHeader, jwtauth.TokenFromQuery))))
	defer srv.Close()
	for range 5 {
		resp, err := http.Get(srv.URL + "/api/sse?jwt=" + sseToken)
		require.NoError(t, err)
		defer resp.Body.Close()
		require.Equal(t, 200, resp.StatusCode)
	}
	client := &http.Client{Timeout: 2 * time.Second}
	req, _ := http.NewRequest("GET", srv.URL+"/api/users/me", nil)
	req.Header.Set("Authorization", "Bearer "+apiToken)
	resp, err := client.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, 200, resp.StatusCode)
	for _, tc := range []struct {
		method, path string
		want         int
	}{{"POST", "/api/sse", 405}, {"GET", "/api/sse/extra", 404}} {
		req, _ := http.NewRequest(tc.method, srv.URL+tc.path+"?jwt="+sseToken, nil)
		response, err := client.Do(req)
		require.NoError(t, err)
		response.Body.Close()
		require.Equal(t, tc.want, response.StatusCode)
	}
}
