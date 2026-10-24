package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"npm/internal/entity/sso"

	"github.com/stretchr/testify/require"
)

func TestExchangeOriginUsesConfiguredPublicURL(t *testing.T) {
	db := ssoAdminDB(t)
	require.NoError(t, db.Model(&sso.Policy{}).Where("id = ?", 1).Update("public_url", "https://npm.example").Error)
	for _, tc := range []struct {
		origin, referer string
		allowed         bool
	}{
		{"https://npm.example", "", true},
		{"", "https://npm.example/login", true},
		{"https://attacker.example", "", false},
		{"https://npm.example", "https://attacker.example/", false},
		{"", "", false},
	} {
		r := httptest.NewRequest(http.MethodPost, "https://attacker.example/api/auth/sso/exchange", nil)
		r.Header.Set("Origin", tc.origin)
		r.Header.Set("Referer", tc.referer)
		require.Equal(t, tc.allowed, sameSSOOrigin(r), "%q %q", tc.origin, tc.referer)
	}
}
