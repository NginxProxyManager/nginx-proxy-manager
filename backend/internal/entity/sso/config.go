package sso

import (
	"bytes"
	"encoding/json"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"net/url"
	"reflect"
	"strings"
)

// ValidatePublicURL requires the origin used to generate callbacks. It is
// deliberately independent of the request Host and forwarding headers.
func ValidatePublicURL(raw string) error {
	parsed, err := url.Parse(raw)
	if err != nil || parsed == nil || parsed.Scheme != "https" || parsed.Hostname() == "" || parsed.User != nil || parsed.Path != "" || parsed.RawPath != "" || parsed.RawQuery != "" || parsed.ForceQuery || parsed.Fragment != "" || parsed.Opaque != "" || parsed.String() != raw {
		return errors.New("public_url must be a canonical HTTPS origin")
	}
	return nil
}

func validateEndpoint(raw string) error {
	parsed, err := url.Parse(raw)
	if err != nil || parsed == nil || parsed.Scheme != "https" || parsed.Hostname() == "" || parsed.User != nil || parsed.Fragment != "" || parsed.Opaque != "" || parsed.String() != raw {
		return errors.New("endpoint must be a canonical HTTPS URL")
	}
	return nil
}

type OIDCConfig struct {
	IssuerURL       string   `json:"issuer_url"`
	ClientID        string   `json:"client_id"`
	Scopes          []string `json:"scopes"`
	EmailClaim      string   `json:"email_claim"`
	NameClaim       string   `json:"name_claim"`
	UseUserinfo     bool     `json:"use_userinfo"`
	TokenAuthMethod string   `json:"token_auth_method"`
}
type OAuth2Config struct {
	AuthorizationURL string   `json:"authorization_url"`
	TokenURL         string   `json:"token_url"`
	UserinfoURL      string   `json:"userinfo_url"`
	ClientID         string   `json:"client_id"`
	EmailClaim       string   `json:"email_claim"`
	NameClaim        string   `json:"name_claim"`
	SubjectClaim     string   `json:"subject_claim"`
	TokenAuthMethod  string   `json:"token_auth_method"`
	Scopes           []string `json:"scopes"`
}
type SAMLConfig struct {
	IDPMetadataURL string `json:"idp_metadata_url"`
	IDPMetadataXML string `json:"idp_metadata_xml"`
	SPEntityID     string `json:"sp_entity_id"`
	EmailAttribute string `json:"email_attribute"`
	NameAttribute  string `json:"name_attribute"`
	EmailNameID    bool   `json:"email_name_id"`
	SignRequests   bool   `json:"sign_requests"`
}

// ValidateConfig enforces one protocol's complete public configuration and
// rejects every unknown field, especially credentials. The only credential
// input is the separate write-only secret_value request field.
func ValidateConfig(protocol Protocol, raw string) error {
	switch protocol {
	case OIDC:
		var cfg OIDCConfig
		if err := decodeConfig(raw, &cfg); err != nil {
			return err
		}
		if strings.TrimSpace(cfg.ClientID) == "" || strings.TrimSpace(cfg.EmailClaim) == "" || validateEndpoint(cfg.IssuerURL) != nil || invalidIssuerQuery(cfg.IssuerURL) || !validTokenAuth(cfg.TokenAuthMethod, true) {
			return errors.New("OIDC requires issuer_url, client_id and email_claim")
		}
		return validateScopes(cfg.Scopes)
	case OAuth2:
		var cfg OAuth2Config
		if err := decodeConfig(raw, &cfg); err != nil {
			return err
		}
		if strings.TrimSpace(cfg.ClientID) == "" || strings.TrimSpace(cfg.EmailClaim) == "" || !validTokenAuth(cfg.TokenAuthMethod, false) || validateEndpoint(cfg.AuthorizationURL) != nil || validateEndpoint(cfg.TokenURL) != nil || validateEndpoint(cfg.UserinfoURL) != nil {
			return errors.New("OAuth2 requires HTTPS endpoints, client_id and email_claim")
		}
		return validateScopes(cfg.Scopes)
	case SAML:
		var cfg SAMLConfig
		if err := decodeConfig(raw, &cfg); err != nil {
			return err
		}
		if (cfg.IDPMetadataURL == "") == (cfg.IDPMetadataXML == "") || (cfg.IDPMetadataURL != "" && validateEndpoint(cfg.IDPMetadataURL) != nil) || (cfg.IDPMetadataXML != "" && validateMetadataXML(cfg.IDPMetadataXML) != nil) || validateEntityID(cfg.SPEntityID) != nil || (cfg.EmailNameID == (strings.TrimSpace(cfg.EmailAttribute) != "")) {
			return errors.New("SAML requires one metadata source, sp_entity_id and one email mapping")
		}
		return nil
	default:
		return fmt.Errorf("unsupported SSO protocol")
	}
}

// EquivalentConfig reports whether two valid configurations behave the same
// at login. It compares typed values with omitted defaults applied, so an
// edit that only spells out a default is not treated as a security change.
func EquivalentConfig(protocol Protocol, oldRaw, newRaw string) bool {
	if ValidateConfig(protocol, oldRaw) != nil || ValidateConfig(protocol, newRaw) != nil {
		return false
	}
	oldValue, oldErr := effectiveConfig(protocol, oldRaw)
	newValue, newErr := effectiveConfig(protocol, newRaw)
	return oldErr == nil && newErr == nil && reflect.DeepEqual(oldValue, newValue)
}

func effectiveConfig(protocol Protocol, raw string) (any, error) {
	switch protocol {
	case OIDC:
		var cfg OIDCConfig
		if err := decodeConfig(raw, &cfg); err != nil {
			return nil, err
		}
		if cfg.TokenAuthMethod == "" {
			cfg.TokenAuthMethod = "client_secret_basic"
		}
		if len(cfg.Scopes) == 0 {
			cfg.Scopes = nil
		}
		return cfg, nil
	case OAuth2:
		var cfg OAuth2Config
		if err := decodeConfig(raw, &cfg); err != nil {
			return nil, err
		}
		if len(cfg.Scopes) == 0 {
			cfg.Scopes = nil
		}
		return cfg, nil
	case SAML:
		var cfg SAMLConfig
		if err := decodeConfig(raw, &cfg); err != nil {
			return nil, err
		}
		return cfg, nil
	default:
		return nil, fmt.Errorf("unsupported SSO protocol")
	}
}

func invalidIssuerQuery(raw string) bool {
	u, err := url.Parse(raw)
	return err != nil || u.RawQuery != "" || u.ForceQuery || u.Fragment != ""
}

func validateEntityID(raw string) error {
	parsed, err := url.Parse(raw)
	if err != nil || parsed == nil || parsed.Scheme == "" || parsed.String() != raw || strings.ContainsAny(raw, " \t\r\n") {
		return errors.New("invalid SP entity ID")
	}
	return nil
}

func validateMetadataXML(raw string) error {
	if len(raw) > 1<<20 || strings.Contains(strings.ToUpper(raw), "<!DOCTYPE") {
		return errors.New("invalid SAML metadata XML")
	}
	var root struct{ XMLName xml.Name }
	if err := xml.Unmarshal([]byte(raw), &root); err != nil {
		return errors.New("invalid SAML metadata XML")
	}
	if root.XMLName.Local != "EntityDescriptor" && root.XMLName.Local != "EntitiesDescriptor" {
		return errors.New("invalid SAML metadata root")
	}
	return nil
}

func validTokenAuth(value string, optional bool) bool {
	return (optional && value == "") || value == "client_secret_basic" || value == "client_secret_post"
}

func decodeConfig(raw string, value any) error {
	decoder := json.NewDecoder(bytes.NewBufferString(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(value); err != nil {
		return errors.New("invalid protocol configuration")
	}
	if decoder.Decode(new(any)) != io.EOF {
		return errors.New("invalid protocol configuration")
	}
	return nil
}

func validateScopes(scopes []string) error {
	seen := map[string]bool{}
	for _, scope := range scopes {
		if scope == "" || strings.TrimSpace(scope) != scope || seen[scope] {
			return errors.New("invalid scopes")
		}
		seen[scope] = true
	}
	return nil
}
