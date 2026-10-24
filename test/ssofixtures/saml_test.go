package main

import (
	"encoding/base64"
	"encoding/pem"
	"github.com/crewjam/saml"
	dsig "github.com/russellhaering/goxmldsig"
	"html"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
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
	// Runtime fixture trusts only the public certificate NPM publishes after
	// metadata preview. Missing trust must never downgrade to unsigned mode.
	f.spCertificate = nil
	f.spCertificatePath = filepath.Join(t.TempDir(), "sp.crt")
	if !*f.metadata().IDPSSODescriptors[0].WantAuthnRequestsSigned {
		t.Fatal("signed metadata required before certificate publication")
	}
	response = httptest.NewRecorder()
	f.routes().ServeHTTP(response, httptest.NewRequest("GET", target.String(), nil))
	if response.Code != 400 {
		t.Fatal("missing public certificate did not fail closed")
	}
	if err := os.WriteFile(f.spCertificatePath, pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: cert.Raw}), 0600); err != nil {
		t.Fatal(err)
	}
	response = httptest.NewRecorder()
	f.routes().ServeHTTP(response, httptest.NewRequest("GET", target.String(), nil))
	if response.Code != 200 {
		t.Fatal("runtime public certificate rejected valid signature")
	}
	target.RawQuery = strings.Replace(target.RawQuery, "RelayState=relay", "RelayState=evil", 1)
	response = httptest.NewRecorder()
	f.routes().ServeHTTP(response, httptest.NewRequest("GET", target.String(), nil))
	if response.Code == 200 {
		t.Fatal("tampered request accepted")
	}
}

func TestSAMLFixtureWildcardACSIsLimitedToConnectionRoutes(t *testing.T) {
	f := newSAMLFixture("https://idp.test", "urn:npm:test", "https://npm.test/sso/*", "valid", nil)
	if !f.acceptsACS("https://npm.test/sso/generated-id/acs") {
		t.Fatal("generated connection ACS rejected")
	}
	for _, value := range []string{
		"https://npm.test/sso/generated-id/callback",
		"https://other.test/sso/generated-id/acs",
		"https://npm.test/other/acs",
	} {
		if f.acceptsACS(value) {
			t.Fatalf("unsafe ACS accepted: %s", value)
		}
	}
}

func mustURL(raw string) url.URL {
	u, err := url.Parse(raw)
	if err != nil {
		panic(err)
	}
	return *u
}
