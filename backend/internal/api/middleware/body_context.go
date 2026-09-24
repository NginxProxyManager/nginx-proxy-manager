package middleware

import (
	"context"
	"io"
	"net/http"

	c "npm/internal/api/context"
	h "npm/internal/api/http"
)

// maxRequestBodyBytes bounds how much of a request body this middleware
// will ever buffer into memory. Without a cap here, a client could send an
// arbitrarily large body and have it read fully into memory before schema
// validation (or even auth) ever runs, since this middleware sits ahead of
// both in the chain - a trivial, pre-auth memory-exhaustion vector.
const maxRequestBodyBytes = 1 << 20 // 1 MiB

// BodyContext reads the request body once (bounded by maxRequestBodyBytes)
// and stashes it on the context. A body over the limit is rejected with
// 413, not silently truncated.
func BodyContext() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			var body []byte
			if r.Body != nil {
				r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodyBytes)
				var err error
				if body, err = io.ReadAll(r.Body); err != nil {
					h.ResultErrorJSON(w, r, http.StatusRequestEntityTooLarge, "Request body too large", nil)
					return
				}
			}
			// Add it to the context
			ctx := r.Context()
			ctx = context.WithValue(ctx, c.BodyCtxKey, body)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
