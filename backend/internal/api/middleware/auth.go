package middleware

import (
	"net/http"
	"slices"

	h "npm/internal/api/http"
	"npm/internal/config"
	"npm/internal/entity/user"
	njwt "npm/internal/jwt"
	"npm/internal/logger"

	"github.com/go-chi/jwtauth/v5"
)

// DecodeAuth decodes an auth header
func DecodeAuth() func(http.Handler) http.Handler {
	privateKey, privateKeyParseErr := njwt.GetPrivateKey()
	if privateKeyParseErr != nil && privateKey == nil {
		logger.Error("PrivateKeyParseError", privateKeyParseErr)
	}

	publicKey, publicKeyParseErr := njwt.GetPublicKey()
	if publicKeyParseErr != nil && publicKey == nil {
		logger.Error("PublicKeyParseError", publicKeyParseErr)
	}

	tokenAuth := jwtauth.New("RS256", privateKey, publicKey)
	return jwtauth.Verify(tokenAuth, jwtauth.TokenFromHeader, jwtauth.TokenFromQuery)
}

// Enforce is a authentication middleware to enforce access from the
// jwtauth.Verifier middleware request context values. The Authenticator sends a 401 Unauthorised
// response for any unverified tokens and passes the good ones through.
func Enforce(permissions ...string) func(http.Handler) http.Handler {
	return enforce(false, permissions...)
}

// EnforceSessionOnly allows a pending principal on the minimal self routes.
func EnforceSessionOnly() func(http.Handler) http.Handler { return enforce(true) }

func enforce(pendingAllowed bool, permissions ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !config.IsSetup {
				next.ServeHTTP(w, r)
				return
			}
			ResolveSession(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				principal, _ := CurrentPrincipal(r.Context())
				if len(principal.Capabilities) == 0 && !pendingAllowed {
					h.ResultErrorJSON(w, r, http.StatusForbidden, "Forbidden", nil)
					return
				}
				if len(permissions) > 0 {
					allowed := slices.Contains(principal.Capabilities, user.CapabilityFullAdmin)
					for _, permission := range permissions {
						allowed = allowed || slices.Contains(principal.Capabilities, permission)
					}
					if !allowed {
						h.ResultErrorJSON(w, r, http.StatusForbidden, "Forbidden", nil)
						return
					}
				}
				next.ServeHTTP(w, r)
			})).ServeHTTP(w, r)
		})
	}
}
