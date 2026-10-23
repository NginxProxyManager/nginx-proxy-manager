package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/jwtauth/v5"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	c "npm/internal/api/context"
	"npm/internal/api/middleware"
	"npm/internal/database"
	"npm/internal/entity/auth"
	"npm/internal/entity/user"
)

func TestOwnProfileContainsEmptyCapabilitiesWithoutExpansion(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "profile.db")), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&user.Model{}, &user.HasCapabilityModel{}, &auth.Model{}))
	database.SetDB(db)
	t.Cleanup(func() { database.SetDB(nil) })
	account := user.Model{Name: "Pending", Email: "pending@example.com"}
	require.NoError(t, db.Create(&account).Error)
	route := chi.NewRouteContext()
	route.URLParams.Add("userID", "me")
	r := httptest.NewRequest(http.MethodGet, "/api/users/me", nil)
	ctx := context.WithValue(r.Context(), chi.RouteCtxKey, route)
	ctx = context.WithValue(ctx, c.UserIDCtxKey, account.ID)
	w := httptest.NewRecorder()
	GetUser()(w, r.WithContext(ctx))
	require.Equal(t, http.StatusOK, w.Code)
	require.Contains(t, w.Body.String(), `"capabilities":[]`)
	require.Contains(t, w.Body.String(), `"has_local_credential":false`)
	require.Contains(t, w.Body.String(), `"can_set_local_password":true`)
}

func TestSSOOriginCannotCreateOwnPassword(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "profile.db")), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&user.Model{}, &user.HasCapabilityModel{}, &auth.Model{}))
	database.SetDB(db)
	t.Cleanup(func() { database.SetDB(nil) })
	account := user.Model{Name: "SSO user", Email: "sso@example.com", CredentialOrigin: "sso"}
	require.NoError(t, db.Create(&account).Error)
	route := chi.NewRouteContext()
	route.URLParams.Add("userID", "me")
	r := httptest.NewRequest(http.MethodPost, "/api/users/me/auth", nil)
	ctx := context.WithValue(r.Context(), chi.RouteCtxKey, route)
	ctx = context.WithValue(ctx, c.UserIDCtxKey, account.ID)
	ctx = context.WithValue(ctx, c.BodyCtxKey, []byte(`{"type":"local","secret":"passphrase","current_secret":"passphrase"}`))
	w := httptest.NewRecorder()
	SetAuth()(w, r.WithContext(ctx))
	require.Equal(t, http.StatusForbidden, w.Code)
}

func TestPendingSessionCannotUpdateSelfOrCredentials(t *testing.T) {
	db, id := authSessionFixture(t)
	require.NoError(t, db.Where("user_id = ?", 1).Delete(&user.HasCapabilityModel{}).Error)
	authenticator := jwtauth.New("HS256", []byte("test-only-secret"), nil)
	_, token, err := authenticator.Encode(map[string]any{"uid": 1, "sid": id, "iss": "api"})
	require.NoError(t, err)
	for _, tc := range []struct {
		path    string
		method  string
		handler http.Handler
	}{
		{"/api/users/me", http.MethodPut, http.HandlerFunc(UpdateUser())},
		{"/api/users/me/auth", http.MethodPost, http.HandlerFunc(SetAuth())},
	} {
		route := chi.NewRouteContext()
		route.URLParams.Add("userID", "me")
		r := httptest.NewRequest(tc.method, tc.path, nil)
		r.Header.Set("Authorization", "Bearer "+token)
		ctx := context.WithValue(r.Context(), chi.RouteCtxKey, route)
		ctx = context.WithValue(ctx, c.BodyCtxKey, []byte(`{"type":"local","secret":"passphrase","current_secret":"passphrase"}`))
		r = r.WithContext(ctx)
		w := httptest.NewRecorder()
		jwtauth.Verify(authenticator, jwtauth.TokenFromHeader)(middleware.EnforceSessionOnly()(tc.handler)).ServeHTTP(w, r)
		require.Equal(t, http.StatusForbidden, w.Code, tc.path)
	}
}
