package middleware

import (
	"net/http"

	h "npm/internal/api/http"
	"npm/internal/config"
)

// EnforceSetup will error if the config setup doesn't match what is required
func EnforceSetup() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !config.IsSetup {
				h.ResultErrorJSON(w, r, http.StatusForbidden, "Not available during setup phase", nil)
				return
			}

			// All good
			next.ServeHTTP(w, r)
		})
	}
}
