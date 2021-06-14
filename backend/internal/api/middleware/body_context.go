package middleware

import (
	"context"
	"io/ioutil"
	"net/http"

	c "npm/internal/api/context"
)

// BodyContext simply adds the body data to a context item
func BodyContext() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Grab the Body Data
			var body []byte
			if r.Body != nil {
				body, _ = ioutil.ReadAll(r.Body)
			}
			// Add it to the context
			ctx := r.Context()
			ctx = context.WithValue(ctx, c.BodyCtxKey, body)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
