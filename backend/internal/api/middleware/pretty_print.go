package middleware

import (
	"context"
	"net/http"

	c "npm/internal/api/context"
)

// PrettyPrint will determine whether the request should be pretty printed in output
// with ?pretty=1 or ?pretty=true
func PrettyPrint(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		prettyStr := r.URL.Query().Get("pretty")
		if prettyStr == "1" || prettyStr == "true" {
			ctx := r.Context()
			ctx = context.WithValue(ctx, c.PrettyPrintCtxKey, true)
			next.ServeHTTP(w, r.WithContext(ctx))
		} else {
			next.ServeHTTP(w, r)
		}
	})
}
