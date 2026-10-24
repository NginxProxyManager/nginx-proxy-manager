package middleware

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
	"npm/internal/entity/session"
	"npm/internal/entity/user"
)

func sessionFixture(t *testing.T) (*gorm.DB, string) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "session.db")), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&user.Model{}, &user.HasCapabilityModel{}, &session.Model{}))
	require.NoError(t, db.Exec("CREATE TABLE auth_policy_fence (id INTEGER PRIMARY KEY, revision BIGINT NOT NULL)").Error)
	require.NoError(t, db.Exec("INSERT INTO auth_policy_fence VALUES (1,1)").Error)
	database.SetDB(db)
	previousSetup := config.IsSetup
	config.IsSetup = true
	t.Cleanup(func() { config.IsSetup = previousSetup; database.SetDB(nil) })
	account := user.Model{Name: "Pending", Email: "pending@example.com"}
	require.NoError(t, db.Create(&account).Error)
	id := strings.Repeat("a", 43)
	require.NoError(t, db.Create(&session.Model{ID: id, UserID: account.ID, Source: session.Local, CreatedAt: time.Now().Add(-time.Minute), ExpiresAt: time.Now().Add(time.Hour)}).Error)
	return db, id
}

func requestWithClaims(t *testing.T, claims map[string]any, wrap func(http.Handler) http.Handler) int {
	t.Helper()
	key := []byte("test-only-secret")
	auth := jwtauth.New("HS256", key, nil)
	_, token, err := auth.Encode(claims)
	require.NoError(t, err)
	r := httptest.NewRequest(http.MethodGet, "/resource", nil)
	r.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	base := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) })
	jwtauth.Verify(auth, jwtauth.TokenFromHeader)(wrap(base)).ServeHTTP(w, r)
	return w.Code
}

func TestSessionMiddlewarePurposeAndProvenance(t *testing.T) {
	_, id := sessionFixture(t)
	for _, tc := range []struct {
		name   string
		claims map[string]any
		wrap   func(http.Handler) http.Handler
		status int
	}{
		{"missing sid", map[string]any{"uid": 1, "iss": "api"}, EnforceSessionOnly(), 401},
		{"sse cannot call api", map[string]any{"uid": 1, "sid": id, "iss": "sse"}, EnforceSessionOnly(), 401},
		{"api cannot call sse", map[string]any{"uid": 1, "sid": id, "iss": "api"}, SSEAuth, 401},
		{"pending self session", map[string]any{"uid": 1, "sid": id, "iss": "api"}, EnforceSessionOnly(), 204},
		{"pending protected resource", map[string]any{"uid": 1, "sid": id, "iss": "api"}, Enforce(), 403},
	} {
		t.Run(tc.name, func(t *testing.T) { require.Equal(t, tc.status, requestWithClaims(t, tc.claims, tc.wrap)) })
	}
}

func TestSessionMiddlewareReadsFreshCapabilitiesAndRevocation(t *testing.T) {
	db, id := sessionFixture(t)
	claims := map[string]any{"uid": 1, "sid": id, "iss": "api"}
	wrap := Enforce(user.CapabilityHostsView)
	require.Equal(t, 403, requestWithClaims(t, claims, wrap))
	require.NoError(t, db.Create(&user.HasCapabilityModel{UserID: 1, CapabilityName: user.CapabilityHostsView}).Error)
	require.Equal(t, 204, requestWithClaims(t, claims, wrap))
	require.NoError(t, db.Where("user_id = ?", 1).Delete(&user.HasCapabilityModel{}).Error)
	require.Equal(t, 403, requestWithClaims(t, claims, wrap))
	now := time.Now()
	require.NoError(t, db.Model(&session.Model{}).Where("id = ?", id).Update("revoked_at", now).Error)
	require.Equal(t, 401, requestWithClaims(t, claims, EnforceSessionOnly()))
}
