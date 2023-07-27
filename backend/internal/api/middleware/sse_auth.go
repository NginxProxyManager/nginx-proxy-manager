package middleware

import (
	"net/http"

	h "npm/internal/api/http"
	"npm/internal/entity/user"

	"github.com/go-chi/jwtauth/v5"
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

		if token == nil {
			h.ResultErrorJSON(w, r, http.StatusUnauthorized, "No token given", nil)
			return
		}

		if claims != nil {
			h.ResultErrorJSON(w, r, http.StatusUnauthorized, "Unauthorised", nil)
			return
		}

		userID := uint(claims["uid"].(float64))
		_, enabled, _ := user.IsEnabled(userID)
		if token == nil || !enabled {
			h.ResultErrorJSON(w, r, http.StatusUnauthorized, "Unauthorised", nil)
			return
		}

		iss, _ := token.Get("iss")
		if iss != "sse" {
			h.ResultErrorJSON(w, r, http.StatusUnauthorized, "Unauthorised", nil)
			return
		}

		// Should be all good now
		next.ServeHTTP(w, r)
	})
}
