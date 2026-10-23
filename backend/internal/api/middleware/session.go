package middleware

import (
	"context"
	"net/http"
	"time"

	c "npm/internal/api/context"
	h "npm/internal/api/http"
	"npm/internal/entity/session"

	"github.com/go-chi/jwtauth/v5"
)

type principalKey struct{}

func CurrentPrincipal(ctx context.Context) (session.Principal, bool) {
	p, ok := ctx.Value(principalKey{}).(session.Principal)
	return p, ok
}

func ResolveSession(next http.Handler) http.Handler { return resolveSession("api", next) }

func resolveSession(purpose string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token, claims, err := jwtauth.FromContext(r.Context())
		if err != nil || token == nil || claims == nil {
			h.ResultErrorJSON(w, r, http.StatusUnauthorized, "Unauthorised", nil)
			return
		}
		issuer, ok := token.Issuer()
		if !ok || issuer != purpose {
			h.ResultErrorJSON(w, r, http.StatusUnauthorized, "Unauthorised", nil)
			return
		}
		id, ok := claims["sid"].(string)
		uid, uidOK := claims["uid"].(float64)
		if !ok || id == "" || !uidOK || uid < 1 || uid != float64(uint(uid)) {
			h.ResultErrorJSON(w, r, http.StatusUnauthorized, "Unauthorised", nil)
			return
		}
		principal, err := session.Authorize(r.Context(), id, time.Now().UTC())
		if err != nil || principal.Session.UserID != uint(uid) {
			h.ResultErrorJSON(w, r, http.StatusUnauthorized, "Unauthorised", nil)
			return
		}
		ctx := context.WithValue(r.Context(), principalKey{}, principal)
		ctx = context.WithValue(ctx, c.UserIDCtxKey, principal.Session.UserID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
