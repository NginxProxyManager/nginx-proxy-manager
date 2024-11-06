package middleware

import (
	"net/http"

	"npm/internal/logger"
)

// Log will print out route information to the logger
// only when debug is enabled
func Log(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		logger.Debug("Request: %s %s", r.Method, r.URL.Path)
		next.ServeHTTP(w, r)
	})
}
