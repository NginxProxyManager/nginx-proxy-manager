package middleware

import (
	"fmt"
	"net/http"

	h "npm/internal/api/http"
	"npm/internal/config"
)

// EnforceSetup will error if the config setup doesn't match what is required
func EnforceSetup(shouldBeSetup bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if config.IsSetup != shouldBeSetup {
				state := "during"
				if config.IsSetup {
					state = "after"
				}
				h.ResultErrorJSON(w, r, http.StatusForbidden, fmt.Sprintf("Not available %s setup phase", state), nil)
				return
			}

			// All good
			next.ServeHTTP(w, r)
		})
	}
}
