package sso

import (
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	ssoconfig "npm/internal/entity/sso"
	"npm/internal/secretstore"
)

func TestOIDCValidAndInvalidClaims(t *testing.T) {
	for _, scenario := range []string{"valid", "post", "signature", "issuer", "audience", "azp", "nonce", "expired", "userinfo_subject", "email_array", "email_missing"} {
		t.Run(scenario, func(t *testing.T) {
			key, err := rsa.GenerateKey(rand.Reader, 2048)
			require.NoError(t, err)
			other, err := rsa.GenerateKey(rand.Reader, 2048)
			require.NoError(t, err)
			var issuer string
			var nonce, challenge string
			server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				switch r.URL.Path {
				case "/.well-known/openid-configuration":
					_ = json.NewEncoder(w).Encode(map[string]any{"issuer": issuer, "authorization_endpoint": issuer + "/auth", "token_endpoint": issuer + "/token", "jwks_uri": issuer + "/keys", "userinfo_endpoint": issuer + "/user"})
				case "/keys":
					_ = json.NewEncoder(w).Encode(map[string]any{"keys": []any{map[string]any{"kty": "RSA", "kid": "one", "alg": "RS256", "use": "sig", "n": base64.RawURLEncoding.EncodeToString(key.N.Bytes()), "e": "AQAB"}}})
				case "/token":
					_ = r.ParseForm()
					basicID, basicSecret, hasBasic := r.BasicAuth()
					if scenario == "post" {
						if hasBasic || r.Form.Get("client_id") != "client" || r.Form.Get("client_secret") != "secret" {
							http.Error(w, "wrong auth style", 401)
							return
						}
					} else if !hasBasic || basicID != "client" || basicSecret != "secret" {
						http.Error(w, "wrong auth style", 401)
						return
					}
					sum := sha256.Sum256([]byte(r.Form.Get("code_verifier")))
					if r.Form.Get("code") != "valid" || base64.RawURLEncoding.EncodeToString(sum[:]) != challenge {
						http.Error(w, "bad code", 400)
						return
					}
					claims := map[string]any{"iss": issuer, "sub": "subject-1", "aud": "client", "exp": time.Now().Add(time.Hour).Unix(), "iat": time.Now().Unix(), "nonce": nonce, "email": "allowed@example.com", "name": "Allowed"}
					switch scenario {
					case "issuer":
						claims["iss"] = "https://evil.example"
					case "audience":
						claims["aud"] = "other"
					case "azp":
						claims["aud"] = []string{"client", "other"}
					case "nonce":
						claims["nonce"] = "wrong"
					case "expired":
						claims["exp"] = time.Now().Add(-time.Hour).Unix()
					case "email_array":
						claims["email"] = []string{"allowed@example.com", "other@example.com"}
					case "email_missing":
						delete(claims, "email")
					}
					signKey := key
					if scenario == "signature" {
						signKey = other
					}
					_ = json.NewEncoder(w).Encode(map[string]any{"access_token": "access", "token_type": "Bearer", "id_token": signedTestIDToken(t, signKey, claims)})
				case "/user":
					sub := "subject-1"
					if scenario == "userinfo_subject" {
						sub = "different"
					}
					_ = json.NewEncoder(w).Encode(map[string]any{"sub": sub, "email": "allowed@example.com", "name": "Allowed"})
				default:
					http.NotFound(w, r)
				}
			}))
			defer server.Close()
			issuer = server.URL
			store, err := secretstore.Open(t.TempDir())
			require.NoError(t, err)
			secret, err := store.Seal([]byte(`{"client_secret":"secret"}`), "connection:one")
			require.NoError(t, err)
			method := ""
			if scenario == "post" {
				method = "client_secret_post"
			}
			cfg, _ := json.Marshal(ssoconfig.OIDCConfig{IssuerURL: issuer, ClientID: "client", EmailClaim: "email", NameClaim: "name", UseUserinfo: scenario == "userinfo_subject", TokenAuthMethod: method})
			conn := ssoconfig.Connection{ID: "one", Protocol: ssoconfig.OIDC, ConfigJSON: string(cfg), SecretCiphertext: secret}
			adapter := NewOIDCAdapter(server.Client(), store)
			txn := Transaction{ID: "attempt", PublicURL: "https://npm.example", State: token("s"), StateHash: hash(token("s")), Nonce: token("n"), PKCEVerifier: token("p")}
			nonce = txn.Nonce
			start, err := adapter.Start(context.Background(), conn, txn)
			require.NoError(t, err)
			auth, err := url.Parse(start.RedirectURL)
			require.NoError(t, err)
			challenge = auth.Query().Get("code_challenge")
			require.Equal(t, "S256", auth.Query().Get("code_challenge_method"))
			require.Equal(t, txn.Nonce, auth.Query().Get("nonce"))
			require.Equal(t, "openid email profile", auth.Query().Get("scope"))
			callback := httptest.NewRequest("GET", "https://npm.example/api/auth/sso/oidc/one/callback?code=valid&state="+txn.State, nil)
			identity, err := adapter.Complete(context.Background(), conn, txn, callback)
			if scenario == "valid" || scenario == "post" {
				require.NoError(t, err)
				require.Equal(t, "subject-1", identity.Subject)
				require.Equal(t, "allowed@example.com", identity.Email)
			} else {
				require.ErrorIs(t, err, ErrDenied)
			}
		})
	}
}

func signedTestIDToken(t *testing.T, key *rsa.PrivateKey, claims map[string]any) string {
	t.Helper()
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"RS256","kid":"one","typ":"JWT"}`))
	body, err := json.Marshal(claims)
	require.NoError(t, err)
	message := header + "." + base64.RawURLEncoding.EncodeToString(body)
	digest := sha256.Sum256([]byte(message))
	signature, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, digest[:])
	require.NoError(t, err)
	return strings.Join([]string{message, base64.RawURLEncoding.EncodeToString(signature)}, ".")
}

func TestOIDCServiceBindsBrowserConsumesCallbackAndAcceptsAdvertisedKeyRotation(t *testing.T) {
	f := fixture(t)
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	var issuer, nonce, challenge string
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/.well-known/openid-configuration":
			_ = json.NewEncoder(w).Encode(map[string]any{"issuer": issuer, "authorization_endpoint": issuer + "/auth", "token_endpoint": issuer + "/token", "jwks_uri": issuer + "/keys"})
		case "/keys":
			_ = json.NewEncoder(w).Encode(map[string]any{"keys": []any{map[string]any{"kty": "RSA", "kid": "one", "alg": "RS256", "use": "sig", "n": base64.RawURLEncoding.EncodeToString(key.N.Bytes()), "e": "AQAB"}}})
		case "/token":
			_ = r.ParseForm()
			sum := sha256.Sum256([]byte(r.Form.Get("code_verifier")))
			if base64.RawURLEncoding.EncodeToString(sum[:]) != challenge {
				http.Error(w, "bad verifier", 400)
				return
			}
			claims := map[string]any{"iss": issuer, "sub": "subject-1", "aud": "client", "exp": time.Now().Add(time.Hour).Unix(), "iat": time.Now().Unix(), "nonce": nonce, "email": "allowed@example.com"}
			_ = json.NewEncoder(w).Encode(map[string]any{"access_token": "access", "token_type": "Bearer", "id_token": signedTestIDToken(t, key, claims)})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	issuer = server.URL
	secret, err := f.key.Seal([]byte(`{"client_secret":"secret"}`), "connection:"+f.conn)
	require.NoError(t, err)
	cfg, _ := json.Marshal(ssoconfig.OIDCConfig{IssuerURL: issuer, ClientID: "client", EmailClaim: "email"})
	require.NoError(t, f.db.Model(&ssoconfig.Connection{}).Where("id = ?", f.conn).Updates(map[string]any{"config_json": string(cfg), "secret_ciphertext": secret}).Error)
	f.service = NewService(f.db, f.key, map[ssoconfig.Protocol]Adapter{ssoconfig.OIDC: NewOIDCAdapter(server.Client(), f.key)})
	start, err := f.service.Begin(context.Background(), f.conn, f.browser, "/")
	require.NoError(t, err)
	u, err := url.Parse(start.RedirectURL)
	require.NoError(t, err)
	nonce, challenge = u.Query().Get("nonce"), u.Query().Get("code_challenge")
	callback := httptest.NewRequest("GET", "https://npm.example/sso/"+f.conn+"/callback?state="+u.Query().Get("state")+"&code=valid", nil)
	_, err = f.service.Complete(context.Background(), f.conn, token("z"), callback)
	require.ErrorIs(t, err, ErrDenied)
	code, err := f.service.Complete(context.Background(), f.conn, f.browser, callback)
	require.NoError(t, err)
	require.NotEmpty(t, code)
	_, err = f.service.Complete(context.Background(), f.conn, f.browser, callback)
	require.ErrorIs(t, err, ErrDenied)
	key, err = rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	rotated, err := f.service.Begin(context.Background(), f.conn, f.browser, "/")
	require.NoError(t, err)
	rotatedURL, err := url.Parse(rotated.RedirectURL)
	require.NoError(t, err)
	nonce, challenge = rotatedURL.Query().Get("nonce"), rotatedURL.Query().Get("code_challenge")
	rotatedCallback := httptest.NewRequest("GET", "https://npm.example/sso/"+f.conn+"/callback?state="+rotatedURL.Query().Get("state")+"&code=valid", nil)
	_, err = f.service.Complete(context.Background(), f.conn, f.browser, rotatedCallback)
	require.NoError(t, err, "new issuer-advertised signing key must verify")
}

func TestOIDCRejectsInsecureAdvertisedAuthorizationURL(t *testing.T) {
	var issuer string
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"issuer": issuer, "authorization_endpoint": "http://insecure.example/auth", "token_endpoint": issuer + "/token", "jwks_uri": issuer + "/keys"})
	}))
	defer server.Close()
	issuer = server.URL
	store, err := secretstore.Open(t.TempDir())
	require.NoError(t, err)
	secret, err := store.Seal([]byte(`{"client_secret":"secret"}`), "connection:one")
	require.NoError(t, err)
	cfg, _ := json.Marshal(ssoconfig.OIDCConfig{IssuerURL: issuer, ClientID: "client", EmailClaim: "email"})
	conn := ssoconfig.Connection{ID: "one", Protocol: ssoconfig.OIDC, ConfigJSON: string(cfg), SecretCiphertext: secret}
	adapter := NewOIDCAdapter(server.Client(), store)
	_, err = adapter.Start(context.Background(), conn, Transaction{ID: "attempt", PublicURL: "https://npm.example", State: token("s"), Nonce: token("n"), PKCEVerifier: token("p")})
	require.ErrorIs(t, err, ErrDenied)
}
