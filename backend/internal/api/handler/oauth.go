package handler

import (
	"net/http"
	h "npm/internal/api/http"
)

// Legacy OAuth cannot provide the browser-bound provenance required by the
// new SSO flow. Task 11 replaces these endpoints with guarded adapters.
func OAuthLogin() http.HandlerFunc    { return legacyOAuthGone }
func OAuthRedirect() http.HandlerFunc { return legacyOAuthGone }

func legacyOAuthGone(w http.ResponseWriter, r *http.Request) {
	h.ResultErrorJSON(w, r, http.StatusGone, "Legacy OAuth login is unavailable", nil)
}
