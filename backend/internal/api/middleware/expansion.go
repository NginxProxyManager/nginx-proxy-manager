package middleware

import (
	"context"
	"net/http"
	"strings"

	c "npm/internal/api/context"
)

// Expansion will determine whether the request should have objects expanded
// with ?expand=item,item
func Expansion(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		expandStr := r.URL.Query().Get("expand")
		if expandStr != "" {
			ctx := r.Context()
			ctx = context.WithValue(ctx, c.ExpansionCtxKey, strings.Split(expandStr, ","))
			next.ServeHTTP(w, r.WithContext(ctx))
		} else {
			next.ServeHTTP(w, r)
		}
	})
}

// GetExpandFromContext returns the Expansion setting
func GetExpandFromContext(r *http.Request) []string {
	expand, ok := r.Context().Value(c.ExpansionCtxKey).([]string)
	if !ok {
		return nil
	}
	return expand
}
