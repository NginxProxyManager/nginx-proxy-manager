package main

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"net/http"
	"net/url"
	"sync"
)

type oauth2Fixture struct {
	origin, clientID, secret, scenario string
	mu                                 sync.Mutex
	codes                              map[string]fixtureCode
}

func validOAuth2Case(value string) bool {
	switch value {
	case "valid", "email_missing", "email_array", "userinfo_401", "userinfo_nonjson":
		return true
	}
	return false
}

func newOAuth2Fixture(origin, clientID, secret, scenario string) *oauth2Fixture {
	return &oauth2Fixture{origin: origin, clientID: clientID, secret: secret, scenario: scenario, codes: make(map[string]fixtureCode)}
}

func (f *oauth2Fixture) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/auth", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		q := r.URL.Query()
		redirect, err := url.Parse(q.Get("redirect_uri"))
		if err != nil || redirect.Scheme != "https" || redirect.Host == "" || q.Get("client_id") != f.clientID || q.Get("response_type") != "code" || q.Get("state") == "" || q.Get("code_challenge_method") != "S256" || q.Get("code_challenge") == "" {
			http.Error(w, "invalid authorization request", 400)
			return
		}
		value := make([]byte, 32)
		if _, err := rand.Read(value); err != nil {
			http.Error(w, "entropy failed", 500)
			return
		}
		code := base64.RawURLEncoding.EncodeToString(value)
		f.mu.Lock()
		f.codes[code] = fixtureCode{challenge: q.Get("code_challenge"), redirect: q.Get("redirect_uri")}
		f.mu.Unlock()
		values := redirect.Query()
		values.Set("state", q.Get("state"))
		values.Set("code", code)
		redirect.RawQuery = values.Encode()
		http.Redirect(w, r, redirect.String(), http.StatusFound)
	})
	mux.HandleFunc("/token", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		if r.ParseForm() != nil {
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
		jsonResponse(w, map[string]string{"access_token": "fixture-oauth2-access", "token_type": "Bearer"})
	})
	mux.HandleFunc("/user", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		if r.Header.Get("Authorization") != "Bearer fixture-oauth2-access" || f.scenario == "userinfo_401" {
			http.Error(w, "unauthorized", 401)
			return
		}
		if f.scenario == "userinfo_nonjson" {
			_, _ = w.Write([]byte("invalid json"))
			return
		}
		profile := map[string]any{"email": "allowed@example.com", "name": "Fixture User", "subject": "fixture-oauth2-user"}
		if f.scenario == "email_missing" {
			delete(profile, "email")
		}
		if f.scenario == "email_array" {
			profile["email"] = []string{"allowed@example.com"}
		}
		jsonResponse(w, map[string]any{"profile": profile})
	})
	return mux
}
