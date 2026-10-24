package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
)

func TestFixtureOIDCDiscoveryAndAuthorization(t *testing.T) {
	fixture := newOIDCFixture("https://idp.example", "npm", "secret", "valid")
	server := httptest.NewServer(fixture.routes())
	defer server.Close()
	response, err := server.Client().Get(server.URL + "/.well-known/openid-configuration")
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	var metadata map[string]string
	if err := json.NewDecoder(response.Body).Decode(&metadata); err != nil {
		t.Fatal(err)
	}
	if metadata["issuer"] != "https://idp.example" || metadata["jwks_uri"] != "https://idp.example/keys" {
		t.Fatalf("unexpected discovery: %#v", metadata)
	}
	client := &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	q := url.Values{"response_type": {"code"}, "client_id": {"npm"}, "state": {"state"}, "nonce": {"nonce"}, "code_challenge_method": {"S256"}, "code_challenge": {"challenge"}, "redirect_uri": {"https://npm.example/sso/one/callback"}}
	response, err = client.Get(server.URL + "/auth?" + q.Encode())
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	location, err := url.Parse(response.Header.Get("Location"))
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != http.StatusFound || location.Host != "npm.example" || location.Query().Get("state") != "state" || location.Query().Get("code") == "" {
		t.Fatalf("invalid auth redirect: %v %s", response.StatusCode, location)
	}
}

func TestFixtureCaseSelectorRejectsUnknownCases(t *testing.T) {
	if validCase("typo") || !validCase("signature") || !validCase("rotation") {
		t.Fatal("case selector must name a supported behavior")
	}
}

func TestFixtureCredentialsAreGenerated(t *testing.T) {
	first := randomCredential()
	second := randomCredential()
	if len(first) < 32 || first == second {
		t.Fatal("fixture credentials must be independent random values")
	}
}
