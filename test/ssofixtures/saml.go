package main

import (
	"bytes"
	"compress/flate"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"encoding/xml"
	"html/template"
	"io"
	"math/big"
	"net/http"
	"net/url"
	"strings"

	"time"

	"github.com/beevik/etree"
	"github.com/crewjam/saml"
	dsig "github.com/russellhaering/goxmldsig"
)

type samlFixture struct {
	issuer, entityID, acs, scenario string
	key                             *rsa.PrivateKey
	cert                            *x509.Certificate
	secondKey                       *rsa.PrivateKey
	secondCert                      *x509.Certificate
	spCertificate                   *x509.Certificate
}

func fixtureSAMLKey() (*rsa.PrivateKey, *x509.Certificate) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		panic(err)
	}
	serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		panic(err)
	}
	cert := &x509.Certificate{SerialNumber: serial, Subject: pkix.Name{CommonName: "Disposable SAML fixture"}, NotBefore: time.Now().Add(-time.Hour), NotAfter: time.Now().Add(24 * time.Hour), KeyUsage: x509.KeyUsageDigitalSignature}
	der, err := x509.CreateCertificate(rand.Reader, cert, cert, &key.PublicKey, key)
	if err != nil {
		panic(err)
	}
	cert, err = x509.ParseCertificate(der)
	if err != nil {
		panic(err)
	}
	return key, cert
}
func newSAMLFixture(issuer, entityID, acs, scenario string, spCert *x509.Certificate) *samlFixture {
	key, cert := fixtureSAMLKey()
	secondKey, secondCert := fixtureSAMLKey()
	return &samlFixture{issuer: issuer, entityID: entityID, acs: acs, scenario: scenario, key: key, cert: cert, secondKey: secondKey, secondCert: secondCert, spCertificate: spCert}
}
func validSAMLCase(value string) bool {
	switch value {
	case "valid", "outer", "signature", "issuer", "audience", "destination", "recipient", "in_response_to", "expired", "unsigned", "duplicate", "wrapping", "encrypted", "unsolicited", "email_multiple", "cert_overlap", "cert_untrusted":
		return true
	}
	return false
}
func (f *samlFixture) metadata() *saml.EntityDescriptor {
	certs := []*x509.Certificate{f.cert}
	if f.scenario == "cert_overlap" {
		certs = append(certs, f.secondCert)
	}
	keys := []saml.KeyDescriptor{}
	for _, cert := range certs {
		keys = append(keys, saml.KeyDescriptor{Use: "signing", KeyInfo: saml.KeyInfo{X509Data: saml.X509Data{X509Certificates: []saml.X509Certificate{{Data: base64.StdEncoding.EncodeToString(cert.Raw)}}}}})
	}
	signed := f.spCertificate != nil
	return &saml.EntityDescriptor{EntityID: f.issuer, IDPSSODescriptors: []saml.IDPSSODescriptor{{SSODescriptor: saml.SSODescriptor{RoleDescriptor: saml.RoleDescriptor{ProtocolSupportEnumeration: "urn:oasis:names:tc:SAML:2.0:protocol", KeyDescriptors: keys}}, WantAuthnRequestsSigned: &signed, SingleSignOnServices: []saml.Endpoint{{Binding: saml.HTTPRedirectBinding, Location: f.issuer + "/sso"}}}}}
}
func (f *samlFixture) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/metadata", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/samlmetadata+xml")
		_ = xml.NewEncoder(w).Encode(f.metadata())
	})
	mux.HandleFunc("/sso", f.login)
	return mux
}
func (f *samlFixture) login(w http.ResponseWriter, r *http.Request) {
	fail := func() { http.Error(w, "invalid SAML fixture request", 400) }
	if r.Method != http.MethodGet || len(r.URL.RawQuery) > 1<<20 {
		fail()
		return
	}
	q := r.URL.Query()
	if len(q["SAMLRequest"]) != 1 || len(q["RelayState"]) != 1 {
		fail()
		return
	}
	if f.spCertificate != nil {
		key, ok := f.spCertificate.PublicKey.(*rsa.PublicKey)
		if !ok || q.Get("SigAlg") != dsig.RSASHA256SignatureMethod || len(q["Signature"]) != 1 || len(q["SigAlg"]) != 1 {
			fail()
			return
		}
		signed := "SAMLRequest=" + url.QueryEscape(q.Get("SAMLRequest")) + "&RelayState=" + url.QueryEscape(q.Get("RelayState")) + "&SigAlg=" + url.QueryEscape(q.Get("SigAlg"))
		sum := sha256.Sum256([]byte(signed))
		sig, err := base64.StdEncoding.DecodeString(q.Get("Signature"))
		if err != nil || rsa.VerifyPKCS1v15(key, crypto.SHA256, sum[:], sig) != nil {
			fail()
			return
		}
	}
	compressed, err := base64.StdEncoding.DecodeString(q.Get("SAMLRequest"))
	if err != nil {
		fail()
		return
	}
	reader := flate.NewReader(bytes.NewReader(compressed))
	defer reader.Close()
	raw, err := io.ReadAll(io.LimitReader(reader, (1<<20)+1))
	if err != nil || len(raw) > 1<<20 {
		fail()
		return
	}
	var request saml.AuthnRequest
	if xml.Unmarshal(raw, &request) != nil || request.ID == "" || request.Issuer == nil || request.Issuer.Value != f.entityID || !f.acceptsACS(request.AssertionConsumerServiceURL) || request.Destination != f.issuer+"/sso" || request.ProtocolBinding != saml.HTTPPostBinding {
		fail()
		return
	}
	response, err := f.response(request.ID, request.AssertionConsumerServiceURL)
	if err != nil {
		fail()
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	page := template.Must(template.New("post").Parse(`<form method="post" action="{{.ACS}}"><input type="hidden" name="SAMLResponse" value="{{.Response}}"><input type="hidden" name="RelayState" value="{{.Relay}}"><button type="submit">Continue to NPM</button></form><script>document.forms[0].submit()</script>`))
	_ = page.Execute(w, map[string]string{"ACS": request.AssertionConsumerServiceURL, "Response": base64.StdEncoding.EncodeToString(response), "Relay": q.Get("RelayState")})
}
func (f *samlFixture) acceptsACS(value string) bool {
	if strings.HasSuffix(f.acs, "/*") {
		prefix := strings.TrimSuffix(f.acs, "*")
		return strings.HasPrefix(value, prefix) && strings.HasSuffix(value, "/acs")
	}
	return value == f.acs
}
func (f *samlFixture) response(requestID, acs string) ([]byte, error) {
	now := time.Now().UTC()
	a := &saml.Assertion{ID: "_" + randomCredential(), Version: "2.0", IssueInstant: now, Issuer: saml.Issuer{Value: f.issuer}, Subject: &saml.Subject{NameID: &saml.NameID{Value: "allowed@example.com", Format: string(saml.EmailAddressNameIDFormat)}, SubjectConfirmations: []saml.SubjectConfirmation{{Method: "urn:oasis:names:tc:SAML:2.0:cm:bearer", SubjectConfirmationData: &saml.SubjectConfirmationData{Recipient: acs, InResponseTo: requestID, NotOnOrAfter: now.Add(5 * time.Minute)}}}}, Conditions: &saml.Conditions{NotBefore: now.Add(-time.Minute), NotOnOrAfter: now.Add(5 * time.Minute), AudienceRestrictions: []saml.AudienceRestriction{{Audience: saml.Audience{Value: f.entityID}}}}, AttributeStatements: []saml.AttributeStatement{{Attributes: []saml.Attribute{{Name: "mail", Values: []saml.AttributeValue{{Value: "allowed@example.com"}}}, {Name: "displayName", Values: []saml.AttributeValue{{Value: "Fixture User"}}}}}}}
	response := &saml.Response{ID: "_" + randomCredential(), Version: "2.0", IssueInstant: now, Destination: acs, InResponseTo: requestID, Issuer: &saml.Issuer{Value: f.issuer}, Status: saml.Status{StatusCode: saml.StatusCode{Value: saml.StatusSuccess}}, Assertion: a}
	switch f.scenario {
	case "issuer":
		a.Issuer.Value = "https://other.test"
	case "audience":
		a.Conditions.AudienceRestrictions[0].Audience.Value = "urn:other"
	case "destination":
		response.Destination = "https://other.test/acs"
	case "recipient":
		a.Subject.SubjectConfirmations[0].SubjectConfirmationData.Recipient = "https://other.test/acs"
	case "in_response_to":
		a.Subject.SubjectConfirmations[0].SubjectConfirmationData.InResponseTo = "_other"
	case "expired":
		a.Conditions.NotOnOrAfter = now.Add(-time.Hour)
	case "unsolicited":
		response.InResponseTo = ""
	case "email_multiple":
		a.AttributeStatements[0].Attributes[0].Values = append(a.AttributeStatements[0].Attributes[0].Values, saml.AttributeValue{Value: "other@example.com"})
	}
	key, cert := f.key, f.cert
	if f.scenario == "cert_overlap" || f.scenario == "cert_untrusted" {
		key, cert = f.secondKey, f.secondCert
	}
	ctx := dsig.NewDefaultSigningContext(dsig.TLSCertKeyStore(tls.Certificate{Certificate: [][]byte{cert.Raw}, PrivateKey: key}))
	ctx.IdAttribute = "ID"
	ctx.Canonicalizer = dsig.MakeC14N10ExclusiveCanonicalizerWithPrefixList("")
	if err := ctx.SetSignatureMethod(dsig.RSASHA256SignatureMethod); err != nil {
		return nil, err
	}
	root := response.Element()
	assertion := root.FindElement("./Assertion")
	if f.scenario != "unsigned" && f.scenario != "outer" {
		signed, err := ctx.SignEnveloped(assertion)
		if err != nil {
			return nil, err
		}
		root.RemoveChild(assertion)
		root.AddChild(signed)
		assertion = signed
	}
	switch f.scenario {
	case "signature":
		assertion.FindElement("./Subject/NameID").SetText("tampered@example.com")
	case "duplicate":
		root.AddChild(assertion.Copy())
	case "wrapping":
		root.RemoveChild(assertion)
		root.CreateElement("samlp:Extensions").AddChild(assertion)
		root.AddChild(a.Element())
	case "encrypted":
		root.RemoveChild(assertion)
		root.CreateElement("saml:EncryptedAssertion")
	case "outer":
		signed, err := ctx.SignEnveloped(root)
		if err != nil {
			return nil, err
		}
		root = signed
	}
	doc := etree.NewDocument()
	doc.SetRoot(root)
	return doc.WriteToBytes()
}
