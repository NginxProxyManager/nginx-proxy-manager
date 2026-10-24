package middleware

import (
	"net/http"

	h "npm/internal/api/http"
)

// SSEAuth will validate that the jwt token provided to get this far is a SSE token
// and that the user is enabled
func SSEAuth(next http.Handler) http.Handler {
	return resolveSession("sse", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		principal, _ := CurrentPrincipal(r.Context())
		if len(principal.Capabilities) == 0 {
			h.ResultErrorJSON(w, r, http.StatusForbidden, "Forbidden", nil)
			return
		}
		next.ServeHTTP(w, r)
	}))
}
