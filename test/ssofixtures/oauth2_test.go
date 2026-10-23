package main

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func TestOAuth2FixtureCodePKCEAndUserinfo(t *testing.T) {
	var fixture *oauth2Fixture
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { fixture.routes().ServeHTTP(w, r) }))
	defer server.Close()
	fixture = newOAuth2Fixture(server.URL, "client", "secret", "valid")
	client := server.Client()
	client.CheckRedirect = func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }
	verifier := strings.Repeat("v", 43)
	sum := sha256.Sum256([]byte(verifier))
	query := url.Values{"client_id": {"client"}, "response_type": {"code"}, "redirect_uri": {"https://npm.example/sso/one/callback"}, "state": {"state"}, "code_challenge_method": {"S256"}, "code_challenge": {base64.RawURLEncoding.EncodeToString(sum[:])}}
	resp, err := client.Get(server.URL + "/auth?" + query.Encode())
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusFound {
		t.Fatalf("auth status %d", resp.StatusCode)
	}
	redirect, err := url.Parse(resp.Header.Get("Location"))
	if err != nil {
		t.Fatal(err)
	}
	code := redirect.Query().Get("code")
	if code == "" || redirect.Query().Get("state") != "state" {
		t.Fatal("missing callback binding")
	}
	form := url.Values{"grant_type": {"authorization_code"}, "code": {code}, "redirect_uri": {"https://npm.example/sso/one/callback"}, "code_verifier": {verifier}}
	req, err := http.NewRequest(http.MethodPost, server.URL+"/token", strings.NewReader(form.Encode()))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.SetBasicAuth("client", "secret")
	resp, err = client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("token status %d", resp.StatusCode)
	}
	var token map[string]string
	if err := json.NewDecoder(resp.Body).Decode(&token); err != nil {
		t.Fatal(err)
	}
	if token["access_token"] != "fixture-oauth2-access" || token["id_token"] != "" {
		t.Fatal("unexpected token response")
	}
	req, err = http.NewRequest(http.MethodGet, server.URL+"/user", nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Authorization", "Bearer "+token["access_token"])
	resp, err = client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var profile struct {
		Profile struct {
			Email string `json:"email"`
		} `json:"profile"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&profile); err != nil {
		t.Fatal(err)
	}
	if profile.Profile.Email != "allowed@example.com" {
		t.Fatalf("email %q", profile.Profile.Email)
	}
}
