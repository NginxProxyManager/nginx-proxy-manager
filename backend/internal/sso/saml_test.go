package sso

import (
	"bytes"
	"compress/flate"
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/beevik/etree"
	"github.com/crewjam/saml"
	dsig "github.com/russellhaering/goxmldsig"
	"github.com/stretchr/testify/require"
	ssoconfig "npm/internal/entity/sso"
	"npm/internal/secretstore"
)

type samlFixture struct {
	key         *rsa.PrivateKey
	cert        *x509.Certificate
	adapter     *SAMLAdapter
	connection  ssoconfig.Connection
	transaction Transaction
	config      ssoconfig.SAMLConfig
}

func samlTestKey(t *testing.T) (*rsa.PrivateKey, *x509.Certificate) {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	cert := &x509.Certificate{SerialNumber: big.NewInt(time.Now().UnixNano()), Subject: pkix.Name{CommonName: "SAML test"}, NotBefore: time.Now().Add(-time.Hour), NotAfter: time.Now().Add(time.Hour), KeyUsage: x509.KeyUsageDigitalSignature}
	der, err := x509.CreateCertificate(rand.Reader, cert, cert, &key.PublicKey, key)
	require.NoError(t, err)
	cert, err = x509.ParseCertificate(der)
	require.NoError(t, err)
	return key, cert
}
func samlTestMetadata(certs ...*x509.Certificate) string {
	keys := ""
	for _, cert := range certs {
		keys += `<KeyDescriptor use="signing"><ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:X509Data><ds:X509Certificate>` + base64.StdEncoding.EncodeToString(cert.Raw) + `</ds:X509Certificate></ds:X509Data></ds:KeyInfo></KeyDescriptor>`
	}
	return `<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://idp.test"><IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">` + keys + `<SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://idp.test/login"/></IDPSSODescriptor></EntityDescriptor>`
}
func newSAMLFixture(t *testing.T) *samlFixture {
	t.Helper()
	key, cert := samlTestKey(t)
	store, err := secretstore.Open(t.TempDir())
	require.NoError(t, err)
	f := &samlFixture{key: key, cert: cert, adapter: NewSAMLAdapter(nil, store).(*SAMLAdapter), config: ssoconfig.SAMLConfig{IDPMetadataXML: samlTestMetadata(cert), SPEntityID: "urn:npm:test", EmailAttribute: "mail", NameAttribute: "displayName"}}
	f.connection = ssoconfig.Connection{ID: token("c"), Protocol: ssoconfig.SAML, Revision: 1}
	f.transaction = Transaction{ConnectionID: f.connection.ID, PublicURL: "https://npm.test", RequestID: "_" + token("r"), State: token("s"), StateHash: hash(token("s"))}
	f.save(t)
	return f
}
func (f *samlFixture) save(t *testing.T) {
	t.Helper()
	raw, err := json.Marshal(f.config)
	require.NoError(t, err)
	f.connection.ConfigJSON = string(raw)
	preview, err := f.adapter.PreviewMetadata(context.Background(), string(raw))
	require.NoError(t, err)
	cipher, err := f.adapter.PrepareConnection(context.Background(), nil, f.connection, preview.ImportToken)
	require.NoError(t, err)
	f.connection.SecretCiphertext = cipher
}
func (f *samlFixture) response(t *testing.T, mode string) string {
	t.Helper()
	now := time.Now().UTC()
	acs := "https://npm.test/sso/" + f.connection.ID + "/acs"
	assertion := &saml.Assertion{ID: "_assertion", Version: "2.0", IssueInstant: now, Issuer: saml.Issuer{Value: "https://idp.test"}, Subject: &saml.Subject{NameID: &saml.NameID{Value: "alice@example.com", Format: string(saml.EmailAddressNameIDFormat)}, SubjectConfirmations: []saml.SubjectConfirmation{{Method: "urn:oasis:names:tc:SAML:2.0:cm:bearer", SubjectConfirmationData: &saml.SubjectConfirmationData{Recipient: acs, InResponseTo: f.transaction.RequestID, NotOnOrAfter: now.Add(5 * time.Minute)}}}}, Conditions: &saml.Conditions{NotBefore: now.Add(-time.Minute), NotOnOrAfter: now.Add(5 * time.Minute), AudienceRestrictions: []saml.AudienceRestriction{{Audience: saml.Audience{Value: "urn:npm:test"}}}}, AttributeStatements: []saml.AttributeStatement{{Attributes: []saml.Attribute{{Name: "mail", Values: []saml.AttributeValue{{Value: "alice@example.com"}}}, {Name: "displayName", Values: []saml.AttributeValue{{Value: "Alice"}}}}}}}
	response := &saml.Response{ID: "_response", Version: "2.0", IssueInstant: now, Destination: acs, InResponseTo: f.transaction.RequestID, Issuer: &saml.Issuer{Value: "https://idp.test"}, Status: saml.Status{StatusCode: saml.StatusCode{Value: saml.StatusSuccess}}, Assertion: assertion}
	switch mode {
	case "issuer":
		assertion.Issuer.Value = "https://evil.test"
	case "audience":
		assertion.Conditions.AudienceRestrictions[0].Audience.Value = "urn:other"
	case "audience_missing":
		assertion.Conditions.AudienceRestrictions = nil
	case "recipient":
		assertion.Subject.SubjectConfirmations[0].SubjectConfirmationData.Recipient = "https://evil.test/acs"
	case "destination":
		response.Destination = "https://evil.test/acs"
	case "request":
		assertion.Subject.SubjectConfirmations[0].SubjectConfirmationData.InResponseTo = "_other"
	case "unsolicited":
		response.InResponseTo = ""
	case "expired":
		assertion.Conditions.NotOnOrAfter = now.Add(-121 * time.Second)
	case "future":
		assertion.Conditions.NotBefore = now.Add(121 * time.Second)
	case "future_issue":
		assertion.IssueInstant = now.Add(121 * time.Second)
	case "missing_subject":
		assertion.Subject = nil
	case "missing_conditions":
		assertion.Conditions = nil
	case "missing_confirmation":
		assertion.Subject.SubjectConfirmations = nil
	case "missing_id":
		assertion.ID = ""
	case "email_multiple":
		assertion.AttributeStatements[0].Attributes[0].Values = append(assertion.AttributeStatements[0].Attributes[0].Values, saml.AttributeValue{Value: "evil@example.com"})
	case "email_duplicate":
		assertion.AttributeStatements[0].Attributes = append(assertion.AttributeStatements[0].Attributes, assertion.AttributeStatements[0].Attributes[0])
	case "email_missing":
		assertion.AttributeStatements = nil
	case "nameid_format":
		assertion.Subject.NameID.Format = string(saml.PersistentNameIDFormat)
	}
	root := response.Element()
	a := root.FindElement("./Assertion")
	if mode != "unsigned" && mode != "outer" {
		ctx := dsig.NewDefaultSigningContext(dsig.TLSCertKeyStore(tls.Certificate{Certificate: [][]byte{f.cert.Raw}, PrivateKey: f.key}))
		ctx.IdAttribute = "ID"
		ctx.Canonicalizer = dsig.MakeC14N10ExclusiveCanonicalizerWithPrefixList("")
		require.NoError(t, ctx.SetSignatureMethod(dsig.RSASHA256SignatureMethod))
		signed, err := ctx.SignEnveloped(a)
		require.NoError(t, err)
		root.RemoveChild(a)
		root.AddChild(signed)
		a = signed
	}
	switch mode {
	case "signature":
		a.FindElement("./Subject/NameID").SetText("evil@example.com")
	case "duplicate":
		root.AddChild(a.Copy())
	case "wrapping":
		wrap := root.CreateElement("Extensions")
		root.RemoveChild(a)
		wrap.AddChild(a)
		root.AddChild(assertion.Element())
	case "unsigned_sibling":
		root.AddChild(assertion.Element())
	case "encrypted":
		root.RemoveChild(a)
		root.CreateElement("saml:EncryptedAssertion")
	}
	if mode == "outer" {
		ctx := dsig.NewDefaultSigningContext(dsig.TLSCertKeyStore(tls.Certificate{Certificate: [][]byte{f.cert.Raw}, PrivateKey: f.key}))
		ctx.IdAttribute = "ID"
		ctx.Canonicalizer = dsig.MakeC14N10ExclusiveCanonicalizerWithPrefixList("")
		require.NoError(t, ctx.SetSignatureMethod(dsig.RSASHA256SignatureMethod))
		signed, err := ctx.SignEnveloped(root)
		require.NoError(t, err)
		root = signed
	}
	doc := etree.NewDocument()
	doc.SetRoot(root)
	raw, err := doc.WriteToString()
	require.NoError(t, err)
	return raw
}
func (f *samlFixture) complete(t *testing.T, raw string) (Identity, error) {
	t.Helper()
	form := url.Values{"SAMLResponse": {base64.StdEncoding.EncodeToString([]byte(raw))}, "RelayState": {f.transaction.State}}
	req := httptest.NewRequest(http.MethodPost, "https://untrusted-host.test", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	return f.adapter.Complete(context.Background(), f.connection, f.transaction, req)
}
func TestSAMLSignatureAndProfile(t *testing.T) {
	f := newSAMLFixture(t)
	for _, mode := range []string{"valid", "outer", "unsigned", "signature", "issuer", "audience", "audience_missing", "recipient", "destination", "request", "unsolicited", "expired", "future", "future_issue", "missing_subject", "missing_conditions", "missing_confirmation", "missing_id", "duplicate", "wrapping", "unsigned_sibling", "encrypted", "email_multiple", "email_duplicate", "email_missing"} {
		t.Run(mode, func(t *testing.T) {
			identity, err := f.complete(t, f.response(t, mode))
			if mode == "valid" || mode == "outer" {
				require.NoError(t, err)
				require.Equal(t, "alice@example.com", identity.Email)
				require.Equal(t, "Alice", identity.Name)
				require.Equal(t, "_assertion", identity.ReplayIDs[0].ID)
				require.False(t, identity.ReplayIDs[0].ExpiresAt.IsZero())
				if mode == "outer" {
					require.Len(t, identity.ReplayIDs, 2)
				} else {
					require.Len(t, identity.ReplayIDs, 1)
				}
			} else {
				require.Error(t, err)
				require.Empty(t, identity)
			}
		})
	}
	f.config.EmailAttribute = ""
	f.config.EmailNameID = true
	f.save(t)
	_, err := f.complete(t, f.response(t, "valid"))
	require.NoError(t, err)
	_, err = f.complete(t, f.response(t, "nameid_format"))
	require.Error(t, err)
}
func TestSAMLStartSigningAndMetadata(t *testing.T) {
	f := newSAMLFixture(t)
	f.config.SignRequests = true
	f.save(t)
	result, err := f.adapter.Start(context.Background(), f.connection, f.transaction)
	require.NoError(t, err)
	u, err := url.Parse(result.RedirectURL)
	require.NoError(t, err)
	require.Equal(t, "https://idp.test/login", u.Scheme+"://"+u.Host+u.Path)
	require.Equal(t, f.transaction.State, u.Query().Get("RelayState"))
	require.Equal(t, dsig.RSASHA256SignatureMethod, u.Query().Get("SigAlg"))
	compressed, err := base64.StdEncoding.DecodeString(u.Query().Get("SAMLRequest"))
	require.NoError(t, err)
	reader := flate.NewReader(bytes.NewReader(compressed))
	defer reader.Close()
	requestXML, err := io.ReadAll(reader)
	require.NoError(t, err)
	var request saml.AuthnRequest
	require.NoError(t, xml.Unmarshal(requestXML, &request))
	require.Equal(t, f.transaction.RequestID, request.ID)
	require.Equal(t, "https://npm.test/sso/"+f.connection.ID+"/acs", request.AssertionConsumerServiceURL)
	require.Equal(t, saml.HTTPPostBinding, request.ProtocolBinding)
	raw, err := f.adapter.Metadata(context.Background(), f.connection, "https://npm.test")
	require.NoError(t, err)
	var metadata saml.EntityDescriptor
	require.NoError(t, xml.Unmarshal(raw, &metadata))
	require.Equal(t, "urn:npm:test", metadata.EntityID)
	require.Len(t, metadata.SPSSODescriptors[0].AssertionConsumerServices, 1)
	require.Equal(t, saml.HTTPPostBinding, metadata.SPSSODescriptors[0].AssertionConsumerServices[0].Binding)
	require.Empty(t, metadata.SPSSODescriptors[0].SingleLogoutServices)
	require.Len(t, metadata.SPSSODescriptors[0].KeyDescriptors, 1)
	require.Equal(t, "signing", metadata.SPSSODescriptors[0].KeyDescriptors[0].Use)
	require.NotContains(t, string(raw), "PRIVATE KEY")
	certData := metadata.SPSSODescriptors[0].KeyDescriptors[0].KeyInfo.X509Data.X509Certificates[0].Data
	der, err := base64.StdEncoding.DecodeString(certData)
	require.NoError(t, err)
	cert, err := x509.ParseCertificate(der)
	require.NoError(t, err)
	signedQuery := strings.Split(u.RawQuery, "&Signature=")[0]
	sig, err := base64.StdEncoding.DecodeString(u.Query().Get("Signature"))
	require.NoError(t, err)
	sum := sha256.Sum256([]byte(signedQuery))
	require.NoError(t, rsa.VerifyPKCS1v15(cert.PublicKey.(*rsa.PublicKey), crypto.SHA256, sum[:], sig))
	require.Contains(t, string(raw), "https://npm.test/sso/"+f.connection.ID+"/acs")
	_, err = f.adapter.Metadata(context.Background(), f.connection, "http://evil.test")
	require.Error(t, err)
}
func TestSAMLBoundedCallbackBeforeParsing(t *testing.T) {
	req := httptest.NewRequest("POST", "https://npm.test", strings.NewReader("RelayState="+token("s")+"&padding="+strings.Repeat("x", 1<<20)))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	_, err := CallbackState(req)
	require.Error(t, err)
}
func TestSAMLTrustSnapshotAndRotation(t *testing.T) {
	f := newSAMLFixture(t)
	old := f.connection
	key2, cert2 := samlTestKey(t)
	f.config.IDPMetadataXML = samlTestMetadata(f.cert, cert2)
	f.save(t)
	f.key = key2
	f.cert = cert2
	_, err := f.complete(t, f.response(t, "valid"))
	require.NoError(t, err)
	rotated := f.connection
	f.connection = old
	_, err = f.complete(t, f.response(t, "valid"))
	require.Error(t, err)
	f.connection = rotated
	keep, err := f.adapter.PrepareConnection(context.Background(), &rotated, rotated, "")
	require.NoError(t, err)
	require.Equal(t, rotated.SecretCiphertext, keep)
	cfg := f.config
	cfg.IDPMetadataXML = samlTestMetadata(cert2)
	raw, _ := json.Marshal(cfg)
	changed := rotated
	changed.ConfigJSON = string(raw)
	_, err = f.adapter.PrepareConnection(context.Background(), &rotated, changed, "")
	require.Error(t, err)
	preview, err := f.adapter.PreviewMetadata(context.Background(), changed.ConfigJSON)
	require.NoError(t, err)
	require.Len(t, preview.CertificateFingerprints, 1)
	require.NotContains(t, fmt.Sprint(preview), "PRIVATE KEY")
	_, err = f.adapter.PrepareConnection(context.Background(), &rotated, rotated, preview.ImportToken)
	require.Error(t, err)
}

func TestSAMLRejectsAmbiguousXMLAndInnerSignatures(t *testing.T) {
	f := newSAMLFixture(t)
	for _, mode := range []string{"foreign_subject", "foreign_mail", "duplicate_nameid", "unknown_condition", "invalid_inner_signature"} {
		t.Run(mode, func(t *testing.T) {
			raw := f.response(t, "valid")
			doc := etree.NewDocument()
			require.NoError(t, doc.ReadFromString(raw))
			root := doc.Root()
			a := root.FindElement("./Assertion")
			switch mode {
			case "foreign_subject":
				copy := a.FindElement("./Subject").Copy()
				copy.Space = "evil"
				copy.CreateAttr("xmlns:evil", "urn:evil")
				a.AddChild(copy)
			case "foreign_mail":
				stmt := a.FindElement("./AttributeStatement").Copy()
				stmt.Space = "evil"
				stmt.CreateAttr("xmlns:evil", "urn:evil")
				stmt.FindElement("./Attribute/AttributeValue").SetText("evil@example.com")
				a.AddChild(stmt)
			case "duplicate_nameid":
				subject := a.FindElement("./Subject")
				subject.AddChild(subject.FindElement("./NameID").Copy())
			case "unknown_condition":
				a.FindElement("./Conditions").CreateElement("saml:ProxyRestriction")
			case "invalid_inner_signature":
				a.FindElement("./Subject/NameID").SetText("evil@example.com")
			}
			// An authentic outer signature covers the malicious shape/invalid inner sig.
			ctx := dsig.NewDefaultSigningContext(dsig.TLSCertKeyStore(tls.Certificate{Certificate: [][]byte{f.cert.Raw}, PrivateKey: f.key}))
			ctx.IdAttribute = "ID"
			ctx.Canonicalizer = dsig.MakeC14N10ExclusiveCanonicalizerWithPrefixList("")
			require.NoError(t, ctx.SetSignatureMethod(dsig.RSASHA256SignatureMethod))
			signed, err := ctx.SignEnveloped(root)
			require.NoError(t, err)
			doc.SetRoot(signed)
			out, err := doc.WriteToString()
			require.NoError(t, err)
			_, err = f.complete(t, out)
			require.Error(t, err)
		})
	}
}

func TestSAMLMetadataURLImportsOnlyOnExplicitPreview(t *testing.T) {
	f := newSAMLFixture(t)
	calls := 0
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		_, _ = w.Write([]byte(samlTestMetadata(f.cert)))
	}))
	defer server.Close()
	f.adapter = NewSAMLAdapter(server.Client(), f.adapter.secrets).(*SAMLAdapter)
	f.config.IDPMetadataXML = ""
	f.config.IDPMetadataURL = server.URL
	f.save(t)
	require.Equal(t, 1, calls)
	old := f.connection
	next := old
	next.Name = "Renamed"
	cipher, err := f.adapter.PrepareConnection(context.Background(), &old, next, "")
	require.NoError(t, err)
	require.Equal(t, old.SecretCiphertext, cipher)
	require.NoError(t, f.adapter.Probe(context.Background(), old))
	_, err = f.adapter.Start(context.Background(), old, f.transaction)
	require.NoError(t, err)
	require.Equal(t, 1, calls)
	raw, _ := json.Marshal(f.config)
	preview, err := f.adapter.PreviewMetadata(context.Background(), string(raw))
	require.NoError(t, err)
	require.Equal(t, 2, calls)
	sealed, err := base64.RawURLEncoding.DecodeString(preview.ImportToken)
	require.NoError(t, err)
	plain, err := f.adapter.secrets.Unseal(sealed, samlImportAAD)
	require.NoError(t, err)
	var imported samlImport
	require.NoError(t, json.Unmarshal(plain, &imported))
	imported.ExpiresAt = time.Now().Add(-time.Second)
	plain, _ = json.Marshal(imported)
	sealed, err = f.adapter.secrets.Seal(plain, samlImportAAD)
	require.NoError(t, err)
	_, err = f.adapter.PrepareConnection(context.Background(), &old, next, base64.RawURLEncoding.EncodeToString(sealed))
	require.Error(t, err)
	_, err = f.adapter.PrepareConnection(context.Background(), &old, next, preview.ImportToken+"tamper")
	require.Error(t, err)
}

func TestSAMLMetadataPreviewRejectsOversizedAndInvalidTrust(t *testing.T) {
	f := newSAMLFixture(t)
	for _, mode := range []string{"oversized", "no_certificate", "http_sso", "expired_metadata", "multiple_idps", "doctype"} {
		t.Run(mode, func(t *testing.T) {
			cfg := f.config
			switch mode {
			case "oversized":
				cfg.IDPMetadataXML = strings.Replace(cfg.IDPMetadataXML, "</EntityDescriptor>", "<!--"+strings.Repeat("x", 128<<10)+"--></EntityDescriptor>", 1)
			case "no_certificate":
				cfg.IDPMetadataXML = samlTestMetadata()
			case "http_sso":
				cfg.IDPMetadataXML = strings.ReplaceAll(cfg.IDPMetadataXML, "https://idp.test/login", "http://idp.test/login")
			case "expired_metadata":
				cfg.IDPMetadataXML = strings.Replace(cfg.IDPMetadataXML, `entityID=`, `validUntil="2000-01-01T00:00:00Z" entityID=`, 1)
			case "multiple_idps":
				cfg.IDPMetadataXML = strings.Replace(cfg.IDPMetadataXML, "</EntityDescriptor>", `<IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol"/></EntityDescriptor>`, 1)
			case "doctype":
				cfg.IDPMetadataXML = `<!DOCTYPE test SYSTEM "https://evil.test">` + cfg.IDPMetadataXML
			}
			raw, _ := json.Marshal(cfg)
			_, err := f.adapter.PreviewMetadata(context.Background(), string(raw))
			require.Error(t, err)
		})
	}
}

func TestSAMLServiceRecordsSignedReplayAndRejectsReuseAcrossRequests(t *testing.T) {
	service := fixture(t)
	f := newSAMLFixture(t)
	f.adapter.secrets = service.key
	f.connection.Enabled = true
	f.save(t)
	require.NoError(t, service.db.Save(&f.connection).Error)
	require.NoError(t, service.db.Model(&ssoconfig.Policy{}).Where("id = 1").Update("public_url", "https://npm.test").Error)
	require.NoError(t, service.db.Create(&ssoconfig.AllowlistEntry{Email: "alice@example.com"}).Error)
	svc := NewService(service.db, service.key, map[ssoconfig.Protocol]Adapter{ssoconfig.SAML: f.adapter})
	for attempt := 0; attempt < 2; attempt++ {
		start, err := svc.Begin(context.Background(), service.conn, service.browser, "/")
		require.NoError(t, err)
		u, err := url.Parse(start.RedirectURL)
		require.NoError(t, err)
		var row transactionRow
		require.NoError(t, service.db.First(&row, "id = ?", start.AttemptID).Error)
		plain, err := service.key.Unseal(row.SecretCiphertext, "transaction:"+row.ID)
		require.NoError(t, err)
		var material protocolMaterial
		require.NoError(t, json.Unmarshal(plain, &material))
		f.transaction.RequestID = material.RequestID
		f.transaction.State = u.Query().Get("RelayState")
		raw := f.response(t, "valid")
		form := url.Values{"SAMLResponse": {base64.StdEncoding.EncodeToString([]byte(raw))}, "RelayState": {f.transaction.State}}
		req := httptest.NewRequest("POST", "https://npm.test/sso/"+service.conn+"/acs", strings.NewReader(form.Encode()))
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		code, err := svc.Complete(context.Background(), service.conn, service.browser, req)
		if attempt == 0 {
			require.NoError(t, err)
			require.NotEmpty(t, code)
		} else {
			require.Error(t, err)
			require.Empty(t, code)
		}
	}
	var rows []replayRow
	require.NoError(t, service.db.Find(&rows).Error)
	require.Len(t, rows, 1)
	require.Equal(t, hash(service.conn+"\x00_assertion"), rows[0].ID)
	require.True(t, rows[0].ExpiresAt.After(time.Now().Add(6*time.Minute)))
}

func TestSAMLUnsupportedProfilesRemainActionableThroughService(t *testing.T) {
	for _, mode := range []string{"encrypted", "unsolicited", "artifact"} {
		t.Run(mode, func(t *testing.T) {
			service := fixture(t)
			f := newSAMLFixture(t)
			f.adapter.secrets = service.key
			f.connection.Enabled = true
			f.save(t)
			require.NoError(t, service.db.Save(&f.connection).Error)
			require.NoError(t, service.db.Model(&ssoconfig.Policy{}).Where("id = 1").Update("public_url", "https://npm.test").Error)
			svc := NewService(service.db, service.key, map[ssoconfig.Protocol]Adapter{ssoconfig.SAML: f.adapter})
			start, err := svc.Begin(context.Background(), service.conn, service.browser, "/")
			require.NoError(t, err)
			u, err := url.Parse(start.RedirectURL)
			require.NoError(t, err)
			form := url.Values{"RelayState": {u.Query().Get("RelayState")}, "SAMLResponse": {base64.StdEncoding.EncodeToString([]byte(f.response(t, mode)))}}
			if mode == "artifact" {
				delete(form, "SAMLResponse")
				form.Set("SAMLart", "opaque-artifact")
			}
			req := httptest.NewRequest("POST", "https://npm.test/sso/"+service.conn+"/acs", strings.NewReader(form.Encode()))
			req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
			_, err = svc.Complete(context.Background(), service.conn, service.browser, req)
			require.ErrorIs(t, err, ErrSAMLUnsupported)
		})
	}
}

func TestSAMLIDPRequiredSigningGeneratesReviewedCertificate(t *testing.T) {
	f := newSAMLFixture(t)
	f.config.IDPMetadataXML = strings.Replace(f.config.IDPMetadataXML, "<IDPSSODescriptor ", `<IDPSSODescriptor WantAuthnRequestsSigned="true" `, 1)
	raw, _ := json.Marshal(f.config)
	preview, err := f.adapter.PreviewMetadata(context.Background(), string(raw))
	require.NoError(t, err)
	require.True(t, preview.SignRequests)
	require.Contains(t, preview.SPCertificate, "BEGIN CERTIFICATE")
	f.connection.ConfigJSON = string(raw)
	cipher, err := f.adapter.PrepareConnection(context.Background(), nil, f.connection, preview.ImportToken)
	require.NoError(t, err)
	f.connection.SecretCiphertext = cipher
	start, err := f.adapter.Start(context.Background(), f.connection, f.transaction)
	require.NoError(t, err)
	u, err := url.Parse(start.RedirectURL)
	require.NoError(t, err)
	require.NotEmpty(t, u.Query().Get("Signature"))
}

func TestSAMLUnsignedRequestMetadataHasUsableNameIDFormat(t *testing.T) {
	f := newSAMLFixture(t)
	raw, err := f.adapter.Metadata(context.Background(), f.connection, "https://npm.test")
	require.NoError(t, err)
	var metadata saml.EntityDescriptor
	require.NoError(t, xml.Unmarshal(raw, &metadata))
	require.Equal(t, []saml.NameIDFormat{saml.UnspecifiedNameIDFormat}, metadata.SPSSODescriptors[0].NameIDFormats)
}
