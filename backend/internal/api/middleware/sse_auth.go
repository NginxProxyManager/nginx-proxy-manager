package middleware

import (
	"net/http"

	h "npm/internal/api/http"
	"npm/internal/entity/user"

	"github.com/go-chi/jwtauth"
)

// SSEAuth will validate that the jwt token provided to get this far is a SSE token
// and that the user is enabled
func SSEAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()

		token, claims, err := jwtauth.FromContext(ctx)
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusUnauthorized, err.Error(), nil)
			return
		}

		userID := uint(claims["uid"].(float64))
		_, enabled := user.IsEnabled(userID)
		if token == nil || !token.Valid || !enabled || !claims.VerifyIssuer("sse", true) {
			h.ResultErrorJSON(w, r, http.StatusUnauthorized, "Unauthorised", nil)
			return
		}

		// Should be all good now
		next.ServeHTTP(w, r)
	})
}
