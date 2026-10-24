package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"npm/internal/config"

	"github.com/stretchr/testify/require"
)

func TestPublicSSORoutesAreExplicit(t *testing.T) {
	old := config.IsSetup
	config.IsSetup = false
	t.Cleanup(func() { config.IsSetup = old })
	router := NewRouter()
	for _, tc := range []struct {
		method, path string
		status       int
	}{
		{"GET", "/api/auth/providers", http.StatusForbidden},
		{"POST", "/api/auth/providers", http.StatusForbidden},
		{"GET", "/sso/invalid/start", http.StatusForbidden},
		{"GET", "/sso/invalid/callback", http.StatusSeeOther},
		{"POST", "/sso/invalid/acs", http.StatusSeeOther},
		{"GET", "/sso/invalid/metadata", http.StatusForbidden},
		{"POST", "/api/auth/sso/exchange", http.StatusForbidden},
		{"GET", "/api/auth/sso/exchange", http.StatusForbidden},
	} {
		req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(`{"code":"x"}`))
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		require.Equal(t, tc.status, rec.Code, "%s %s: %s", tc.method, tc.path, rec.Body.String())
	}
}

func TestLegacyOAuthRoutesReturnMigrationCode(t *testing.T) {
	old := config.IsSetup
	config.IsSetup = true
	t.Cleanup(func() { config.IsSetup = old })
	for _, path := range []string{"/oauth/login", "/oauth/redirect"} {
		rec := httptest.NewRecorder()
		NewRouter().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path+"?code=raw-provider-code", nil))
		require.Equal(t, http.StatusGone, rec.Code)
		require.Contains(t, rec.Body.String(), "sso_legacy_oauth_retired")
		require.NotContains(t, rec.Body.String(), "raw-provider-code")
	}
}
