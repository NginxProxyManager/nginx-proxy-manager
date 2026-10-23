package sso

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"encoding/xml"
	"io"
	"math/big"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/crewjam/saml"
	dsig "github.com/russellhaering/goxmldsig"
	ssoconfig "npm/internal/entity/sso"
)

const samlImportAAD = "saml-metadata-import:v1"
const samlImportTokenLimit = 512 << 10

type samlBundle struct {
	Metadata    string `json:"saml_metadata"`
	PrivateKey  []byte `json:"saml_private_key,omitempty"`
	Certificate []byte `json:"saml_certificate,omitempty"`
}
type samlImport struct {
	ConfigHash string
	ExpiresAt  time.Time
	Bundle     samlBundle
}

func samlConfig(raw string) (ssoconfig.SAMLConfig, error) {
	var cfg ssoconfig.SAMLConfig
	if ssoconfig.ValidateConfig(ssoconfig.SAML, raw) != nil || json.Unmarshal([]byte(raw), &cfg) != nil {
		return cfg, ErrDenied
	}
	return cfg, nil
}
func samlConfigHash(cfg ssoconfig.SAMLConfig) string {
	raw, _ := json.Marshal(cfg)
	return hash(string(raw))
}

// PreviewMetadata is the ONLY network import path. Login/probe/save never fetch
// remote metadata. The token authenticates precisely the reviewed trust snapshot.
func (a *SAMLAdapter) PreviewMetadata(ctx context.Context, raw string) (ssoconfig.SAMLMetadataPreview, error) {
	out := ssoconfig.SAMLMetadataPreview{}
	if a == nil || a.secrets == nil {
		return out, ErrDenied
	}
	cfg, err := samlConfig(raw)
	if err != nil {
		return out, err
	}
	metadata := []byte(cfg.IDPMetadataXML)
	if cfg.IDPMetadataURL != "" {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, cfg.IDPMetadataURL, nil)
		if err != nil {
			return out, ErrDenied
		}
		resp, err := a.client.Do(req)
		if err != nil {
			return out, ErrDenied
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			return out, ErrDenied
		}
		metadata, err = io.ReadAll(resp.Body)
		if err != nil {
			return out, ErrDenied
		}
	}
	descriptor, fingerprints, err := parseSAMLMetadata(metadata)
	if err != nil || len(metadata) > 128<<10 {
		return out, ErrDenied
	}
	bundle := samlBundle{Metadata: string(metadata)}
	sign := cfg.SignRequests || samlRequiresSigning(descriptor)
	if sign {
		bundle.PrivateKey, bundle.Certificate, err = generateSAMLKey()
		if err != nil {
			return out, ErrDenied
		}
		out.SPCertificate = string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: bundle.Certificate}))
	}
	token, err := json.Marshal(samlImport{ConfigHash: samlConfigHash(cfg), ExpiresAt: time.Now().Add(10 * time.Minute), Bundle: bundle})
	if err != nil {
		return out, ErrDenied
	}
	sealed, err := a.secrets.Seal(token, samlImportAAD)
	if err != nil {
		return out, ErrDenied
	}
	out.ImportToken = base64.RawURLEncoding.EncodeToString(sealed)
	if len(out.ImportToken) > samlImportTokenLimit {
		return ssoconfig.SAMLMetadataPreview{}, ErrDenied
	}
	out.EntityID = descriptor.EntityID
	out.CertificateFingerprints = fingerprints
	out.SignRequests = sign
	sp := saml.ServiceProvider{IDPMetadata: descriptor}
	out.SSOURL = sp.GetSSOBindingLocation(saml.HTTPRedirectBinding)
	return out, nil
}

// PrepareConnection runs inside the administration policy fence. With no token,
// preserve bytes exactly and reject changed metadata sources/signing policy.
func (a *SAMLAdapter) PrepareConnection(ctx context.Context, old *ssoconfig.Connection, next ssoconfig.Connection, token string) ([]byte, error) {
	if a == nil || next.Protocol != ssoconfig.SAML {
		return nil, ErrDenied
	}
	cfg, err := samlConfig(next.ConfigJSON)
	if err != nil {
		return nil, err
	}
	if token == "" {
		if old == nil || old.Protocol != ssoconfig.SAML || old.ID != next.ID {
			return nil, ErrDenied
		}
		// Retention is not admission: expired or undecryptable trust must never
		// prevent an administrator from disabling a connection or renaming it.
		previous, err := samlConfig(old.ConfigJSON)
		if err != nil {
			return nil, ErrDenied
		}
		if previous.IDPMetadataURL != cfg.IDPMetadataURL || previous.IDPMetadataXML != cfg.IDPMetadataXML || previous.SignRequests != cfg.SignRequests {
			return nil, ErrDenied
		}
		if !old.Enabled && next.Enabled {
			if _, _, err := a.load(next); err != nil {
				return nil, ErrDenied
			}
		}
		return old.SecretCiphertext, nil
	}
	if a.secrets == nil || len(token) > samlImportTokenLimit {
		return nil, ErrDenied
	}
	cipher, err := base64.RawURLEncoding.DecodeString(token)
	if err != nil {
		return nil, ErrDenied
	}
	plain, err := a.secrets.Unseal(cipher, samlImportAAD)
	if err != nil {
		return nil, ErrDenied
	}
	var imported samlImport
	if json.Unmarshal(plain, &imported) != nil || !imported.ExpiresAt.After(time.Now()) || imported.ExpiresAt.After(time.Now().Add(11*time.Minute)) || imported.ConfigHash != samlConfigHash(cfg) {
		return nil, ErrDenied
	}
	if _, _, err := parseSAMLMetadata([]byte(imported.Bundle.Metadata)); err != nil {
		return nil, ErrDenied
	}
	raw, err := json.Marshal(imported.Bundle)
	if err != nil {
		return nil, ErrDenied
	}
	cipher, err = a.secrets.Seal(raw, "connection:"+next.ID)
	if err != nil {
		return nil, ErrDenied
	}
	return cipher, nil
}
func (a *SAMLAdapter) load(c ssoconfig.Connection) (ssoconfig.SAMLConfig, samlBundle, error) {
	var bundle samlBundle
	cfg, err := samlConfig(c.ConfigJSON)
	if a == nil || a.secrets == nil || c.Protocol != ssoconfig.SAML || err != nil {
		return cfg, bundle, ErrDenied
	}
	plain, err := a.secrets.Unseal(c.SecretCiphertext, "connection:"+c.ID)
	if err != nil || json.Unmarshal(plain, &bundle) != nil {
		return cfg, bundle, ErrDenied
	}
	if _, _, err := parseSAMLMetadata([]byte(bundle.Metadata)); err != nil {
		return cfg, bundle, ErrDenied
	}
	return cfg, bundle, nil
}
func (a *SAMLAdapter) serviceProvider(c ssoconfig.Connection, origin string) (*saml.ServiceProvider, ssoconfig.SAMLConfig, error) {
	cfg, bundle, err := a.load(c)
	if err != nil || ssoconfig.ValidatePublicURL(origin) != nil || !validOpaque(c.ID) {
		return nil, cfg, ErrDenied
	}
	metadata, _, err := parseSAMLMetadata([]byte(bundle.Metadata))
	if err != nil {
		return nil, cfg, ErrDenied
	}
	acs, _ := url.Parse(origin + "/sso/" + c.ID + "/acs")
	metaURL, _ := url.Parse(origin + "/sso/" + c.ID + "/metadata")
	sp := &saml.ServiceProvider{EntityID: cfg.SPEntityID, AcsURL: *acs, MetadataURL: *metaURL, IDPMetadata: metadata, AllowIDPInitiated: false, HTTPClient: a.client, SignatureVerifier: samlSignatureVerifier{}}
	sp.AuthnNameIDFormat = saml.UnspecifiedNameIDFormat
	if cfg.EmailNameID {
		sp.AuthnNameIDFormat = saml.EmailAddressNameIDFormat
	}
	if cfg.SignRequests || samlRequiresSigning(metadata) {
		key, err := x509.ParsePKCS1PrivateKey(bundle.PrivateKey)
		if err != nil {
			return nil, cfg, ErrDenied
		}
		cert, err := x509.ParseCertificate(bundle.Certificate)
		if err != nil {
			return nil, cfg, ErrDenied
		}
		public, ok := cert.PublicKey.(*rsa.PublicKey)
		if !ok || !public.Equal(&key.PublicKey) || time.Now().Before(cert.NotBefore) || !time.Now().Before(cert.NotAfter) {
			return nil, cfg, ErrDenied
		}
		sp.Key = key
		sp.Certificate = cert
		sp.SignatureMethod = dsig.RSASHA256SignatureMethod
	}
	return sp, cfg, nil
}
func samlRequiresSigning(metadata *saml.EntityDescriptor) bool {
	for _, descriptor := range metadata.IDPSSODescriptors {
		if descriptor.WantAuthnRequestsSigned != nil && *descriptor.WantAuthnRequestsSigned {
			return true
		}
	}
	return false
}
func parseSAMLMetadata(raw []byte) (*saml.EntityDescriptor, []string, error) {
	root, err := samlXML(raw)
	if err != nil || root.NamespaceURI() != "urn:oasis:names:tc:SAML:2.0:metadata" || root.Tag != "EntityDescriptor" {
		return nil, nil, ErrDenied
	}
	var metadata saml.EntityDescriptor
	if xml.Unmarshal(raw, &metadata) != nil || len(metadata.IDPSSODescriptors) != 1 || metadata.EntityID == "" {
		return nil, nil, ErrDenied
	}
	entity, err := url.Parse(metadata.EntityID)
	if err != nil || entity.Scheme == "" {
		return nil, nil, ErrDenied
	}
	now := time.Now()
	if !metadata.ValidUntil.IsZero() && !metadata.ValidUntil.After(now) {
		return nil, nil, ErrDenied
	}
	descriptor := metadata.IDPSSODescriptors[0]
	if descriptor.ValidUntil != nil && !descriptor.ValidUntil.After(now) {
		return nil, nil, ErrDenied
	}
	if !strings.Contains(" "+descriptor.ProtocolSupportEnumeration+" ", " "+samlProtocolNS+" ") {
		return nil, nil, ErrDenied
	}
	endpoints := 0
	for _, endpoint := range descriptor.SingleSignOnServices {
		if endpoint.Binding == saml.HTTPRedirectBinding {
			endpoints++
			if !samlEndpoint(endpoint.Location) {
				return nil, nil, ErrDenied
			}
		}
	}
	if endpoints != 1 {
		return nil, nil, ErrSAMLUnsupported
	}
	var fingerprints []string
	seen := map[string]bool{}
	for _, key := range descriptor.KeyDescriptors {
		if key.Use != "" && key.Use != "signing" {
			continue
		}
		for _, certificate := range key.KeyInfo.X509Data.X509Certificates {
			der, err := base64.StdEncoding.DecodeString(strings.Join(strings.Fields(certificate.Data), ""))
			if err != nil {
				return nil, nil, ErrDenied
			}
			cert, err := x509.ParseCertificate(der)
			if err != nil {
				return nil, nil, ErrDenied
			}
			sum := sha256.Sum256(cert.Raw)
			fp := hex.EncodeToString(sum[:])
			if !seen[fp] {
				fingerprints = append(fingerprints, fp)
				seen[fp] = true
			}
		}
	}
	if len(fingerprints) == 0 {
		return nil, nil, ErrDenied
	}
	return &metadata, fingerprints, nil
}
func generateSAMLKey() ([]byte, []byte, error) {
	key, err := rsa.GenerateKey(rand.Reader, 3072)
	if err != nil {
		return nil, nil, err
	}
	serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return nil, nil, err
	}
	cert := &x509.Certificate{SerialNumber: serial, Subject: pkix.Name{CommonName: "NPM SAML signing"}, NotBefore: time.Now().Add(-samlSkew), NotAfter: time.Now().AddDate(2, 0, 0), KeyUsage: x509.KeyUsageDigitalSignature}
	der, err := x509.CreateCertificate(rand.Reader, cert, cert, &key.PublicKey, key)
	if err != nil {
		return nil, nil, err
	}
	return x509.MarshalPKCS1PrivateKey(key), der, nil
}
