package main

import (
	"encoding/base64"
	"github.com/crewjam/saml"
	dsig "github.com/russellhaering/goxmldsig"
	"html"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func TestSAMLFixtureSignedPOSTAndRequestVerification(t *testing.T) {
	f := newSAMLFixture("https://idp.test", "urn:npm:test", "https://npm.test/sso/test/acs", "valid", nil)
	server := httptest.NewServer(f.routes())
	defer server.Close()
	sp := saml.ServiceProvider{EntityID: "urn:npm:test", AcsURL: mustURL("https://npm.test/sso/test/acs"), IDPMetadata: f.metadata()}
	req, err := sp.MakeAuthenticationRequest("https://idp.test/sso", saml.HTTPRedirectBinding, saml.HTTPPostBinding)
	if err != nil {
		t.Fatal(err)
	}
	target, err := req.Redirect("relay", &sp)
	if err != nil {
		t.Fatal(err)
	}
	response := httptest.NewRecorder()
	f.routes().ServeHTTP(response, httptest.NewRequest("GET", target.String(), nil))
	if response.Code != 200 {
		t.Fatalf("status %d", response.Code)
	}
	// Parse the HTML form's encoded value, then validate with the real SP library.
	body := response.Body.String()
	start := strings.Index(body, `name="SAMLResponse" value="`)
	if start < 0 {
		t.Fatal("missing POST response")
	}
	value := strings.Split(body[start+len(`name="SAMLResponse" value="`):], `"`)[0]
	raw, err := base64.StdEncoding.DecodeString(html.UnescapeString(value))
	if err != nil {
		t.Fatal(err)
	}
	assertion, err := sp.ParseXMLResponse(raw, []string{req.ID}, sp.AcsURL)
	if err != nil {
		t.Fatal(err)
	}
	if assertion.Subject.NameID.Value != "allowed@example.com" {
		t.Fatal("wrong identity")
	}
	// Trust a generated SP certificate and require a real redirect query signature.
	key, cert := fixtureSAMLKey()
	f.spCertificate = cert
	sp.Key = key
	sp.Certificate = cert
	sp.SignatureMethod = dsig.RSASHA256SignatureMethod
	target, err = req.Redirect("relay", &sp)
	if err != nil {
		t.Fatal(err)
	}
	response = httptest.NewRecorder()
	f.routes().ServeHTTP(response, httptest.NewRequest("GET", target.String(), nil))
	if response.Code != 200 {
		t.Fatal("signed request rejected")
	}
	target.RawQuery = strings.Replace(target.RawQuery, "RelayState=relay", "RelayState=evil", 1)
	response = httptest.NewRecorder()
	f.routes().ServeHTTP(response, httptest.NewRequest("GET", target.String(), nil))
	if response.Code == 200 {
		t.Fatal("tampered request accepted")
	}
}

func mustURL(raw string) url.URL {
	u, err := url.Parse(raw)
	if err != nil {
		panic(err)
	}
	return *u
}
