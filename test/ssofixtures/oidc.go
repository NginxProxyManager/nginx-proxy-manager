package main

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

type oidcFixture struct {
	issuer, clientID, secret, scenario string
	key, oldKey                        *rsa.PrivateKey
	mu                                 sync.Mutex
	codes                              map[string]fixtureCode
	rotated                            bool
}
type fixtureCode struct{ challenge, nonce, redirect string }

func newOIDCFixture(issuer, clientID, secret, scenario string) *oidcFixture {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		panic(err)
	}
	old, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		panic(err)
	}
	return &oidcFixture{issuer: issuer, clientID: clientID, secret: secret, scenario: scenario, key: key, oldKey: old, codes: make(map[string]fixtureCode)}
}

func (f *oidcFixture) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /.well-known/openid-configuration", func(w http.ResponseWriter, _ *http.Request) {
		jsonResponse(w, map[string]any{"issuer": f.issuer, "authorization_endpoint": f.issuer + "/auth", "token_endpoint": f.issuer + "/token", "jwks_uri": f.issuer + "/keys", "userinfo_endpoint": f.issuer + "/user"})
	})
	mux.HandleFunc("GET /keys", func(w http.ResponseWriter, _ *http.Request) {
		f.mu.Lock()
		rotated := f.rotated
		f.mu.Unlock()
		if f.scenario == "rotation" && !rotated {
			jsonResponse(w, map[string]any{"keys": []any{jwk(f.oldKey, "old")}})
			return
		}
		jsonResponse(w, map[string]any{"keys": []any{jwk(f.key, "current")}})
	})
	mux.HandleFunc("POST /rotate", func(w http.ResponseWriter, _ *http.Request) {
		if f.scenario != "rotation" {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		f.mu.Lock()
		f.rotated = true
		f.mu.Unlock()
		w.WriteHeader(http.StatusNoContent)
	})
	mux.HandleFunc("GET /auth", func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		redirect, err := url.Parse(q.Get("redirect_uri"))
		if err != nil || redirect.Scheme != "https" || redirect.Host == "" || q.Get("client_id") != f.clientID || q.Get("response_type") != "code" || q.Get("state") == "" || q.Get("nonce") == "" || q.Get("code_challenge_method") != "S256" || q.Get("code_challenge") == "" {
			http.Error(w, "invalid authorization request", 400)
			return
		}
		codeBytes := make([]byte, 32)
		if _, err := rand.Read(codeBytes); err != nil {
			http.Error(w, "entropy failed", 500)
			return
		}
		code := base64.RawURLEncoding.EncodeToString(codeBytes)
		f.mu.Lock()
		f.codes[code] = fixtureCode{challenge: q.Get("code_challenge"), nonce: q.Get("nonce"), redirect: q.Get("redirect_uri")}
		f.mu.Unlock()
		values := redirect.Query()
		values.Set("state", q.Get("state"))
		values.Set("code", code)
		redirect.RawQuery = values.Encode()
		http.Redirect(w, r, redirect.String(), http.StatusFound)
	})
	mux.HandleFunc("POST /token", func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseForm(); err != nil {
			http.Error(w, "invalid form", 400)
			return
		}
		id, secret, ok := r.BasicAuth()
		if !ok {
			id, secret = r.Form.Get("client_id"), r.Form.Get("client_secret")
		}
		if id != f.clientID || subtle.ConstantTimeCompare([]byte(secret), []byte(f.secret)) != 1 {
			http.Error(w, "bad credentials", 401)
			return
		}
		code := r.Form.Get("code")
		f.mu.Lock()
		binding, exists := f.codes[code]
		delete(f.codes, code)
		f.mu.Unlock()
		sum := sha256.Sum256([]byte(r.Form.Get("code_verifier")))
		if !exists || r.Form.Get("grant_type") != "authorization_code" || r.Form.Get("redirect_uri") != binding.redirect || base64.RawURLEncoding.EncodeToString(sum[:]) != binding.challenge {
			http.Error(w, "invalid grant", 400)
			return
		}
		claims := map[string]any{"iss": f.issuer, "sub": "fixture-user", "aud": f.clientID, "exp": time.Now().Add(time.Hour).Unix(), "iat": time.Now().Unix(), "nonce": binding.nonce, "email": "allowed@example.com", "name": "Fixture User"}
		switch f.scenario {
		case "issuer":
			claims["iss"] = "https://other.example"
		case "audience":
			claims["aud"] = "other-client"
		case "azp":
			claims["aud"] = []string{f.clientID, "other-client"}
		case "nonce":
			claims["nonce"] = "wrong"
		case "expired":
			claims["exp"] = time.Now().Add(-time.Hour).Unix()
		case "email_array":
			claims["email"] = []string{"allowed@example.com", "other@example.com"}
		case "email_missing":
			delete(claims, "email")
		}
		signKey := f.key
		if f.scenario == "signature" {
			signKey = f.oldKey
		}
		jsonResponse(w, map[string]any{"access_token": "fixture-access", "token_type": "Bearer", "id_token": signedToken(signKey, claims)})
	})
	mux.HandleFunc("GET /user", func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer fixture-access" {
			http.Error(w, "unauthorized", 401)
			return
		}
		subject := "fixture-user"
		if f.scenario == "userinfo_subject" {
			subject = "other-user"
		}
		jsonResponse(w, map[string]any{"sub": subject, "email": "allowed@example.com", "name": "Fixture User"})
	})
	return mux
}

func jwk(key *rsa.PrivateKey, kid string) map[string]any {
	return map[string]any{"kty": "RSA", "kid": kid, "alg": "RS256", "use": "sig", "n": base64.RawURLEncoding.EncodeToString(key.N.Bytes()), "e": "AQAB"}
}
func jsonResponse(w http.ResponseWriter, value any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(value)
}
func signedToken(key *rsa.PrivateKey, claims map[string]any) string {
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"RS256","kid":"current","typ":"JWT"}`))
	body, _ := json.Marshal(claims)
	message := header + "." + base64.RawURLEncoding.EncodeToString(body)
	sum := sha256.Sum256([]byte(message))
	signature, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, sum[:])
	if err != nil {
		panic(err)
	}
	return strings.Join([]string{message, base64.RawURLEncoding.EncodeToString(signature)}, ".")
}
