package sso

import (
	"context"
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

func TestOAuth2IdentityAndProviderFailures(t *testing.T) {
	for _, scenario := range []string{"basic", "post", "missing_email", "array_email", "number_email", "duplicate_email", "missing_subject", "userinfo_401", "userinfo_nonjson", "userinfo_trailing", "large_body", "cross_origin", "invalid_path"} {
		t.Run(scenario, func(t *testing.T) {
			var origin, challenge string
			server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				switch r.URL.Path {
				case "/token":
					_ = r.ParseForm()
					id, secret, basic := r.BasicAuth()
					if scenario == "post" {
						id, secret = r.Form.Get("client_id"), r.Form.Get("client_secret")
					}
					sum := sha256.Sum256([]byte(r.Form.Get("code_verifier")))
					if id != "client" || secret != "secret" || basic != (scenario != "post") || r.Form.Get("redirect_uri") != "https://npm.example/sso/one/callback" || r.Form.Get("code") != "code" || base64.RawURLEncoding.EncodeToString(sum[:]) != challenge {
						http.Error(w, "bad exchange", 401)
						return
					}
					_ = json.NewEncoder(w).Encode(map[string]string{"access_token": "access", "token_type": "Bearer"})
				case "/user":
					if r.Header.Get("Authorization") != "Bearer access" {
						http.Error(w, "bad bearer", 401)
						return
					}
					if scenario == "userinfo_401" {
						http.Error(w, "secret response", 401)
						return
					}
					if scenario == "userinfo_nonjson" {
						_, _ = w.Write([]byte("no json"))
						return
					}
					if scenario == "userinfo_trailing" {
						_, _ = w.Write([]byte(`{"profile":{"email":"allowed@example.com"}} {}`))
						return
					}
					if scenario == "duplicate_email" {
						_, _ = w.Write([]byte(`{"profile":{"email":"allowed@example.com","email":"other@example.com"}}`))
						return
					}
					if scenario == "large_body" {
						_, _ = w.Write([]byte(strings.Repeat("x", 1<<20+1)))
						return
					}
					if scenario == "cross_origin" {
						http.Redirect(w, r, "https://evil.example/steal", 302)
						return
					}
					profile := map[string]any{"email": "allowed@example.com", "name": "Allowed", "subject": "stable"}
					switch scenario {
					case "missing_email":
						delete(profile, "email")
					case "array_email":
						profile["email"] = []string{"allowed@example.com"}
					case "number_email":
						profile["email"] = 1
					case "missing_subject":
						delete(profile, "subject")
					}
					_ = json.NewEncoder(w).Encode(map[string]any{"profile": profile, "email": "fallback@example.com"})
				default:
					http.NotFound(w, r)
				}
			}))
			defer server.Close()
			origin = server.URL
			store, err := secretstore.Open(t.TempDir())
			require.NoError(t, err)
			cipher, err := store.Seal([]byte(`{"client_secret":"secret"}`), "connection:one")
			require.NoError(t, err)
			method := "client_secret_basic"
			if scenario == "post" {
				method = "client_secret_post"
			}
			mailPath := "profile.email"
			if scenario == "invalid_path" {
				mailPath = "profile..email"
			}
			cfg, _ := json.Marshal(ssoconfig.OAuth2Config{AuthorizationURL: origin + "/auth", TokenURL: origin + "/token", UserinfoURL: origin + "/user", ClientID: "client", EmailClaim: mailPath, NameClaim: "profile.name", SubjectClaim: "profile.subject", TokenAuthMethod: method, Scopes: []string{"email"}})
			conn := ssoconfig.Connection{ID: "one", Protocol: ssoconfig.OAuth2, ConfigJSON: string(cfg), SecretCiphertext: cipher}
			adapter := NewOAuth2Adapter(server.Client(), store)
			txn := Transaction{ID: "attempt", PublicURL: "https://npm.example", State: token("s"), StateHash: hash(token("s")), PKCEVerifier: token("p")}
			start, err := adapter.Start(context.Background(), conn, txn)
			if scenario == "invalid_path" {
				require.ErrorIs(t, err, ErrDenied)
				return
			}
			require.NoError(t, err)
			auth, err := url.Parse(start.RedirectURL)
			require.NoError(t, err)
			require.Equal(t, "https://npm.example/sso/one/callback", auth.Query().Get("redirect_uri"))
			require.Equal(t, "S256", auth.Query().Get("code_challenge_method"))
			challenge = auth.Query().Get("code_challenge")
			request := httptest.NewRequest("GET", "https://attacker.example/sso/one/callback?state="+txn.State+"&code=code", nil)
			identity, err := adapter.Complete(context.Background(), conn, txn, request)
			if scenario == "basic" || scenario == "post" || scenario == "missing_subject" {
				require.NoError(t, err)
				require.Equal(t, "allowed@example.com", identity.Email)
				require.Equal(t, "Allowed", identity.Name)
				if scenario == "missing_subject" {
					require.Empty(t, identity.Subject)
				} else {
					require.Equal(t, "stable", identity.Subject)
				}
			} else {
				require.ErrorIs(t, err, ErrDenied)
				require.Empty(t, identity.Email)
			}
		})
	}
}

func TestOAuth2ServiceRejectsExpiredWrongBrowserAndDuplicate(t *testing.T) {
	f := fixture(t)
	var origin, challenge string
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/token":
			_ = r.ParseForm()
			sum := sha256.Sum256([]byte(r.Form.Get("code_verifier")))
			if base64.RawURLEncoding.EncodeToString(sum[:]) != challenge {
				http.Error(w, "bad PKCE", 400)
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]string{"access_token": "access", "token_type": "Bearer"})
		case "/user":
			_ = json.NewEncoder(w).Encode(map[string]string{"email": "allowed@example.com"})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	origin = server.URL
	cipher, err := f.key.Seal([]byte(`{"client_secret":"secret"}`), "connection:"+f.conn)
	require.NoError(t, err)
	cfg, _ := json.Marshal(ssoconfig.OAuth2Config{AuthorizationURL: origin + "/auth", TokenURL: origin + "/token", UserinfoURL: origin + "/user", ClientID: "client", EmailClaim: "email", TokenAuthMethod: "client_secret_basic"})
	require.NoError(t, f.db.Model(&ssoconfig.Connection{}).Where("id = ?", f.conn).Updates(map[string]any{"protocol": ssoconfig.OAuth2, "config_json": string(cfg), "secret_ciphertext": cipher}).Error)
	f.service = NewService(f.db, f.key, map[ssoconfig.Protocol]Adapter{ssoconfig.OAuth2: NewOAuth2Adapter(server.Client(), f.key)}, WithClock(func() time.Time { return f.now }))
	start, err := f.service.Begin(context.Background(), f.conn, f.browser, "/")
	require.NoError(t, err)
	u, err := url.Parse(start.RedirectURL)
	require.NoError(t, err)
	challenge = u.Query().Get("code_challenge")
	callback := httptest.NewRequest("GET", "https://npm.example/sso/"+f.conn+"/callback?state="+u.Query().Get("state")+"&code=code", nil)
	_, err = f.service.Complete(context.Background(), f.conn, token("x"), callback)
	require.ErrorIs(t, err, ErrDenied)
	f.now = f.now.Add(6 * time.Minute)
	_, err = f.service.Complete(context.Background(), f.conn, f.browser, callback)
	require.ErrorIs(t, err, ErrDenied)
	f.now = f.now.Add(-6 * time.Minute)
	code, err := f.service.Complete(context.Background(), f.conn, f.browser, callback)
	require.NoError(t, err)
	require.NotEmpty(t, code)
	_, err = f.service.Complete(context.Background(), f.conn, f.browser, callback)
	require.ErrorIs(t, err, ErrDenied)
}

func TestOAuth2ProbeAcceptsExpectedUnauthenticatedResponses(t *testing.T) {
	seen := map[string]bool{}
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodHead || r.Header.Get("Authorization") != "" {
			t.Error("probe sent credentials or unsafe method")
		}
		seen[r.URL.Path] = true
		if r.URL.Path == "/user" {
			w.WriteHeader(http.StatusUnauthorized)
		} else {
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	}))
	defer server.Close()
	store, err := secretstore.Open(t.TempDir())
	require.NoError(t, err)
	cipher, err := store.Seal([]byte(`{"client_secret":"secret"}`), "connection:one")
	require.NoError(t, err)
	cfg, _ := json.Marshal(ssoconfig.OAuth2Config{AuthorizationURL: server.URL + "/auth", TokenURL: server.URL + "/token", UserinfoURL: server.URL + "/user", ClientID: "client", EmailClaim: "email", TokenAuthMethod: "client_secret_basic"})
	conn := ssoconfig.Connection{ID: "one", Protocol: ssoconfig.OAuth2, ConfigJSON: string(cfg), SecretCiphertext: cipher}
	adapter := NewOAuth2Adapter(server.Client(), store).(*OAuth2Adapter)
	require.NoError(t, adapter.Probe(context.Background(), conn))
	require.Equal(t, map[string]bool{"/auth": true, "/token": true, "/user": true}, seen)
}
