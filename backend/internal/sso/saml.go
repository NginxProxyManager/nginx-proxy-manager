package sso

import (
	"bytes"
	"context"
	"crypto/subtle"
	"encoding/base64"
	"encoding/xml"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/beevik/etree"
	"github.com/crewjam/saml"
	xrv "github.com/mattermost/xml-roundtrip-validator"
	dsig "github.com/russellhaering/goxmldsig"
	"github.com/russellhaering/goxmldsig/etreeutils"
	ssoconfig "npm/internal/entity/sso"
	"npm/internal/secretstore"
)

const samlAssertionNS = "urn:oasis:names:tc:SAML:2.0:assertion"
const samlProtocolNS = "urn:oasis:names:tc:SAML:2.0:protocol"
const samlSignatureNS = "http://www.w3.org/2000/09/xmldsig#"
const samlSkew = 2 * time.Minute

// ErrSAMLUnsupported describes supported profiles without echoing provider data.
var ErrSAMLUnsupported = errors.New("sso_saml_unsupported_profile: use SP-initiated Redirect/POST with an unencrypted assertion")

type SAMLAdapter struct {
	client  *http.Client
	secrets *secretstore.Store
}

func NewSAMLAdapter(client *http.Client, secrets *secretstore.Store) Adapter {
	var transport http.RoundTripper
	if client != nil {
		transport = client.Transport
	}
	return &SAMLAdapter{client: boundedProviderClient(transport), secrets: secrets}
}
func (a *SAMLAdapter) Start(ctx context.Context, c ssoconfig.Connection, t Transaction) (StartResult, error) {
	sp, _, err := a.serviceProvider(c, t.PublicURL)
	if err != nil || !validOpaque(t.State) || !validSAMLRequestID(t.RequestID) || t.ConnectionID != c.ID {
		return StartResult{}, ErrDenied
	}
	req, err := sp.MakeAuthenticationRequest(sp.GetSSOBindingLocation(saml.HTTPRedirectBinding), saml.HTTPRedirectBinding, saml.HTTPPostBinding)
	if err != nil {
		return StartResult{}, ErrDenied
	}
	req.ID = t.RequestID
	redirect, err := req.Redirect(t.State, sp)
	if err != nil {
		return StartResult{}, ErrDenied
	}
	return StartResult{RedirectURL: redirect.String(), AttemptID: t.ID}, nil
}
func validSAMLRequestID(id string) bool {
	return strings.HasPrefix(id, "_") && validOpaque(strings.TrimPrefix(id, "_"))
}

func (a *SAMLAdapter) Complete(ctx context.Context, c ssoconfig.Connection, t Transaction, r *http.Request) (Identity, error) {
	if r == nil || r.Method != http.MethodPost || !validSAMLRequestID(t.RequestID) || t.ConnectionID != c.ID {
		return Identity{}, ErrDenied
	}
	state, err := CallbackState(r)
	if err != nil || subtle.ConstantTimeCompare([]byte(hash(state)), []byte(t.StateHash)) != 1 {
		return Identity{}, ErrDenied
	}
	if len(r.Form["SAMLart"]) != 0 {
		return Identity{}, ErrSAMLUnsupported
	}
	if len(r.PostForm["SAMLResponse"]) != 1 || len(r.PostForm["RelayState"]) != 1 || len(r.URL.Query()) != 0 {
		return Identity{}, ErrDenied
	}
	encoded := r.PostForm.Get("SAMLResponse")
	if len(encoded) > base64.StdEncoding.EncodedLen(providerBodyLimit) {
		return Identity{}, ErrDenied
	}
	raw, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return Identity{}, ErrDenied
	}
	root, err := samlXML(raw)
	if err != nil {
		return Identity{}, ErrDenied
	}
	outerSigned, err := samlResponseShape(root)
	if err != nil {
		return Identity{}, err
	}
	sp, cfg, err := a.serviceProvider(c, t.PublicURL)
	if err != nil {
		return Identity{}, ErrDenied
	}
	var envelope saml.Response
	if xml.Unmarshal(raw, &envelope) != nil || envelope.Destination != sp.AcsURL.String() || envelope.Issuer == nil || envelope.Issuer.Value != sp.IDPMetadata.EntityID || envelope.Version != "2.0" {
		return Identity{}, ErrDenied
	}
	if envelope.InResponseTo == "" {
		return Identity{}, ErrSAMLUnsupported
	}
	now := time.Now().UTC()
	if envelope.IssueInstant.IsZero() || envelope.IssueInstant.After(now.Add(samlSkew)) {
		return Identity{}, ErrDenied
	}
	assertion, err := sp.ParseXMLResponse(raw, []string{t.RequestID}, sp.AcsURL)
	if err != nil {
		return Identity{}, ErrDenied
	}
	// Tighten the library's global three-minute skew locally; never mutate globals.
	if assertion.ID == "" || assertion.Version != "2.0" || assertion.IssueInstant.IsZero() || assertion.IssueInstant.After(now.Add(samlSkew)) || assertion.Subject == nil || assertion.Subject.NameID == nil || strings.TrimSpace(assertion.Subject.NameID.Value) == "" || assertion.Conditions == nil {
		return Identity{}, ErrDenied
	}
	conditions := assertion.Conditions
	if conditions.NotOnOrAfter.IsZero() || !conditions.NotOnOrAfter.Add(samlSkew).After(now) || conditions.NotBefore.After(now.Add(samlSkew)) || (!conditions.NotBefore.IsZero() && !conditions.NotBefore.Before(conditions.NotOnOrAfter)) || len(conditions.AudienceRestrictions) == 0 {
		return Identity{}, ErrDenied
	}
	for _, restriction := range conditions.AudienceRestrictions {
		if restriction.Audience.Value != cfg.SPEntityID {
			return Identity{}, ErrDenied
		}
	}
	if len(assertion.Subject.SubjectConfirmations) != 1 {
		return Identity{}, ErrDenied
	}
	confirmation := assertion.Subject.SubjectConfirmations[0]
	data := confirmation.SubjectConfirmationData
	if confirmation.Method != "urn:oasis:names:tc:SAML:2.0:cm:bearer" || data == nil || data.Recipient != sp.AcsURL.String() || data.InResponseTo != t.RequestID || data.NotOnOrAfter.IsZero() || !data.NotOnOrAfter.Add(samlSkew).After(now) || data.NotBefore.After(now.Add(samlSkew)) {
		return Identity{}, ErrDenied
	}
	expiry := conditions.NotOnOrAfter
	if data.NotOnOrAfter.Before(expiry) {
		expiry = data.NotOnOrAfter
	}
	email := ""
	if cfg.EmailNameID {
		if assertion.Subject.NameID.Format != string(saml.EmailAddressNameIDFormat) {
			return Identity{}, ErrDenied
		}
		email = assertion.Subject.NameID.Value
	} else {
		var ok bool
		email, ok = samlAttribute(assertion, cfg.EmailAttribute)
		if !ok {
			return Identity{}, ErrDenied
		}
	}
	if _, err := ssoconfig.NormalizeEmail(email); err != nil {
		return Identity{}, ErrDenied
	}
	name, _ := samlAttribute(assertion, cfg.NameAttribute)
	identity := Identity{Subject: assertion.Subject.NameID.Value, Email: email, Name: name, ReplayIDs: []ReplayID{{ID: assertion.ID, ExpiresAt: expiry}}}
	if outerSigned {
		if envelope.ID == "" {
			return Identity{}, ErrDenied
		}
		identity.ReplayIDs = append(identity.ReplayIDs, ReplayID{ID: envelope.ID, ExpiresAt: expiry})
	}
	return identity, nil
}
func samlAttribute(assertion *saml.Assertion, key string) (string, bool) {
	if key == "" {
		return "", false
	}
	count := 0
	value := ""
	for _, statement := range assertion.AttributeStatements {
		for _, attr := range statement.Attributes {
			if attr.Name == key {
				count++
				if len(attr.Values) != 1 {
					return "", false
				}
				value = attr.Values[0].Value
			}
		}
	}
	return value, count == 1 && strings.TrimSpace(value) != ""
}

// Bound work before either XML parser; reject directives, duplicate attributes
// and IDs, and excessive nesting. Neither parser fetches external data.
func samlXML(raw []byte) (*etree.Element, error) {
	if len(raw) == 0 || len(raw) > providerBodyLimit {
		return nil, ErrDenied
	}
	decoder := xml.NewDecoder(bytes.NewReader(raw))
	depth := 0
	roots := 0
	nodes := 0
	ids := map[string]bool{}
	for {
		tok, err := decoder.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, ErrDenied
		}
		switch el := tok.(type) {
		case xml.Directive:
			return nil, ErrDenied
		case xml.StartElement:
			depth++
			nodes++
			if depth == 1 {
				roots++
			}
			if depth > 64 || nodes > 20000 {
				return nil, ErrDenied
			}
			attrs := map[xml.Name]bool{}
			for _, attr := range el.Attr {
				if attrs[attr.Name] {
					return nil, ErrDenied
				}
				attrs[attr.Name] = true
				if attr.Name.Local == "ID" {
					if attr.Value == "" || ids[attr.Value] {
						return nil, ErrDenied
					}
					ids[attr.Value] = true
				}
			}
		case xml.EndElement:
			depth--
		case xml.CharData:
			if depth == 0 && strings.TrimSpace(string(el)) != "" {
				return nil, ErrDenied
			}
		}
	}
	if roots != 1 || depth != 0 || xrv.Validate(bytes.NewReader(raw)) != nil {
		return nil, ErrDenied
	}
	doc := etree.NewDocument()
	if doc.ReadFromBytes(raw) != nil || doc.Root() == nil {
		return nil, ErrDenied
	}
	return doc.Root(), nil
}
func children(e *etree.Element, ns, name string) []*etree.Element {
	var out []*etree.Element
	for _, child := range e.ChildElements() {
		if child.NamespaceURI() == ns && child.Tag == name {
			out = append(out, child)
		}
	}
	return out
}
func single(e *etree.Element, ns, name string) *etree.Element {
	all := children(e, ns, name)
	if len(all) != 1 {
		return nil
	}
	return all[0]
}
func samlResponseShape(root *etree.Element) (bool, error) {
	if root.NamespaceURI() != samlProtocolNS || root.Tag != "Response" {
		return false, ErrDenied
	}
	assertions := 0
	var walk func(*etree.Element) error
	walk = func(e *etree.Element) error {
		switch e.Tag {
		case "Assertion", "Issuer", "Subject", "NameID", "SubjectConfirmation", "SubjectConfirmationData", "Conditions", "AudienceRestriction", "Audience", "AttributeStatement", "Attribute", "AttributeValue":
			if e.NamespaceURI() != samlAssertionNS {
				return ErrDenied
			}
		}
		if e.Tag == "EncryptedAssertion" || e.Tag == "EncryptedID" {
			return ErrSAMLUnsupported
		}
		if e.Tag == "Assertion" {
			assertions++
		}
		for _, child := range e.ChildElements() {
			if err := walk(child); err != nil {
				return err
			}
		}
		return nil
	}
	if err := walk(root); err != nil {
		return false, err
	}
	assertion := single(root, samlAssertionNS, "Assertion")
	if assertions != 1 || assertion == nil || single(root, samlAssertionNS, "Issuer") == nil || single(root, samlProtocolNS, "Status") == nil {
		return false, ErrDenied
	}
	subject := single(assertion, samlAssertionNS, "Subject")
	conditions := single(assertion, samlAssertionNS, "Conditions")
	if subject == nil || conditions == nil || single(assertion, samlAssertionNS, "Issuer") == nil || single(subject, samlAssertionNS, "NameID") == nil {
		return false, ErrDenied
	}
	confirmation := single(subject, samlAssertionNS, "SubjectConfirmation")
	if confirmation == nil || single(confirmation, samlAssertionNS, "SubjectConfirmationData") == nil {
		return false, ErrDenied
	}
	// The upstream decoder ignores unknown condition types; reject instead.
	for _, child := range conditions.ChildElements() {
		if child.NamespaceURI() != samlAssertionNS || child.Tag != "AudienceRestriction" || single(child, samlAssertionNS, "Audience") == nil {
			return false, ErrDenied
		}
	}
	for _, statement := range children(assertion, samlAssertionNS, "AttributeStatement") {
		for _, attr := range statement.ChildElements() {
			if attr.NamespaceURI() != samlAssertionNS || attr.Tag != "Attribute" {
				return false, ErrDenied
			}
			for _, value := range attr.ChildElements() {
				if value.NamespaceURI() != samlAssertionNS || value.Tag != "AttributeValue" || len(value.ChildElements()) != 0 {
					return false, ErrDenied
				}
			}
		}
	}
	if len(children(root, samlSignatureNS, "Signature")) > 1 || len(children(assertion, samlSignatureNS, "Signature")) > 1 {
		return false, ErrDenied
	}
	return len(children(root, samlSignatureNS, "Signature")) == 1, nil
}

// Require one same-element reference and whole-element transforms. All crypto,
// digests and canonicalization remain in goxmldsig, not application code.
// This prevents validating a subset then consuming unsigned descendants.
type samlSignatureVerifier struct{}

func (samlSignatureVerifier) VerifySignature(ctx *dsig.ValidationContext, el *etree.Element) error {
	sig := single(el, samlSignatureNS, "Signature")
	if sig == nil {
		return ErrDenied
	}
	info := single(sig, samlSignatureNS, "SignedInfo")
	if info == nil {
		return ErrDenied
	}
	ref := single(info, samlSignatureNS, "Reference")
	if ref == nil || ref.SelectAttrValue("URI", "") != "#"+el.SelectAttrValue("ID", "") || el.SelectAttrValue("ID", "") == "" {
		return ErrDenied
	}
	method := single(info, samlSignatureNS, "SignatureMethod")
	if method == nil {
		return ErrDenied
	}
	switch method.SelectAttrValue("Algorithm", "") {
	case dsig.RSASHA256SignatureMethod, dsig.RSASHA384SignatureMethod, dsig.RSASHA512SignatureMethod, dsig.ECDSASHA256SignatureMethod, dsig.ECDSASHA384SignatureMethod, dsig.ECDSASHA512SignatureMethod:
	default:
		return ErrDenied
	}
	digest := single(ref, samlSignatureNS, "DigestMethod")
	if digest == nil {
		return ErrDenied
	}
	switch digest.SelectAttrValue("Algorithm", "") {
	case "http://www.w3.org/2001/04/xmlenc#sha256", "http://www.w3.org/2001/04/xmldsig-more#sha384", "http://www.w3.org/2001/04/xmlenc#sha512":
	default:
		return ErrDenied
	}
	transforms := single(ref, samlSignatureNS, "Transforms")
	if transforms == nil {
		return ErrDenied
	}
	enveloped := 0
	for _, tr := range transforms.ChildElements() {
		if tr.NamespaceURI() != samlSignatureNS || tr.Tag != "Transform" {
			return ErrDenied
		}
		switch tr.SelectAttrValue("Algorithm", "") {
		case "http://www.w3.org/2000/09/xmldsig#enveloped-signature":
			enveloped++
		case "http://www.w3.org/2001/10/xml-exc-c14n#", "http://www.w3.org/TR/2001/REC-xml-c14n-20010315", "http://www.w3.org/2006/12/xml-c14n11":
		default:
			return ErrDenied
		}
	}
	if enveloped != 1 {
		return ErrDenied
	}
	if _, err := ctx.Validate(el); err != nil {
		return ErrDenied
	}
	// A valid outer signature does not excuse a present but invalid assertion
	// signature. Verify it too, with the same metadata trust store.
	if el.Tag == "Response" {
		assertion := single(el, samlAssertionNS, "Assertion")
		if assertion != nil && len(children(assertion, samlSignatureNS, "Signature")) != 0 {
			parent, err := etreeutils.NSBuildParentContext(assertion)
			if err != nil {
				return ErrDenied
			}
			ns, err := parent.SubContext(assertion)
			if err != nil {
				return ErrDenied
			}
			detached, err := etreeutils.NSDetatch(ns, assertion)
			if err != nil {
				return ErrDenied
			}
			if err := (samlSignatureVerifier{}).VerifySignature(ctx, detached); err != nil {
				return ErrDenied
			}
		}
	}
	return nil
}

// Metadata receives the validated policy origin, never request Host.
func (a *SAMLAdapter) Metadata(ctx context.Context, c ssoconfig.Connection, origin string) ([]byte, error) {
	sp, _, err := a.serviceProvider(c, origin)
	if err != nil {
		return nil, ErrDenied
	}
	metadata := sp.Metadata()
	descriptor := &metadata.SPSSODescriptors[0]
	descriptor.AssertionConsumerServices = descriptor.AssertionConsumerServices[:1]
	descriptor.SingleLogoutServices = nil
	keys := descriptor.KeyDescriptors[:0]
	for _, key := range descriptor.KeyDescriptors {
		if key.Use == "signing" {
			keys = append(keys, key)
		}
	}
	descriptor.KeyDescriptors = keys
	return xml.MarshalIndent(metadata, "", "  ")
}
func (a *SAMLAdapter) Probe(ctx context.Context, c ssoconfig.Connection) error {
	_, _, err := a.load(c)
	return err
}
func samlEndpoint(raw string) bool {
	u, err := url.Parse(raw)
	return err == nil && u.Scheme == "https" && u.Hostname() != "" && u.User == nil && u.Fragment == "" && u.RawQuery == "" && u.Opaque == ""
}
