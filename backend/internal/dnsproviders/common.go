package dnsproviders

import (
	"encoding/json"

	"npm/internal/errors"
)

// providerField should mimick jsonschema, so that
// the ui can render a field and validate it
// before we do.
// See: https://json-schema.org/draft/2020-12/json-schema-validation.html
type providerField struct {
	Title                string `json:"title"`
	Type                 string `json:"type"`
	AdditionalProperties bool   `json:"additionalProperties"`
	Minimum              int    `json:"minimum,omitempty"`
	Maximum              int    `json:"maximum,omitempty"`
	MinLength            int    `json:"minLength,omitempty"`
	MaxLength            int    `json:"maxLength,omitempty"`
	Pattern              string `json:"pattern,omitempty"`
	IsSecret             bool   `json:"-"` // Not valid jsonschema
}

// Provider is a simple struct
type Provider struct {
	Title                string                   `json:"title"`
	Type                 string                   `json:"type"` // Should always be "object"
	AdditionalProperties bool                     `json:"additionalProperties"`
	MinProperties        int                      `json:"minProperties,omitempty"`
	Required             []string                 `json:"required,omitempty"`
	Properties           map[string]providerField `json:"properties"`
}

// GetJSONSchema encodes this object as JSON string
func (p *Provider) GetJSONSchema() (string, error) {
	b, err := json.Marshal(p)
	return string(b), err
}

// ConvertToUpdatable will manipulate this object so that it returns
// an updatable json schema
func (p *Provider) ConvertToUpdatable() {
	p.MinProperties = 1
	p.Required = nil
}

// List returns an array of providers
func List() []Provider {
	return []Provider{
		getDNSAcmeDNS(),
		getDNSAd(),
		getDNSAli(),
		getDNSAws(),
		getDNSAutoDNS(),
		getDNSAzure(),
		getDNSCf(),
		getDNSCloudns(),
		getDNSConoha(),
		getDNSCx(),
		getDNSCyon(),
		getDNSDgon(),
		getDNSMe(),
		getDNSDNSimple(),
		getDNSDa(),
		getDNSDp(),
		getDNSDpi(),
		getDNSDreamhost(),
		getDNSDuckDNS(),
		getDNSDyn(),
		getDNSDynu(),
		getDNSEuserv(),
		getDNSFreeDNS(),
		getDNSGandiLiveDNS(),
		getDNSGd(),
		getDNSHe(),
		getDNSInfoblox(),
		getDNSInwx(),
		getDNSIspconfig(),
		getDNSKinghost(),
		getDNSLinodeV4(),
		getDNSLoopia(),
		getDNSLua(),
		getDNSNamecom(),
		getDNSNamesilo(),
		getDNSOne(),
		getDNSYandex(),
		getDNSSelectel(),
		getDNSServercow(),
		getDNSTele3(),
		getDNSPDNS(),
		getDNSUnoeuro(),
		getDNSVscale(),
		getDNSDNZilore(),
		getDNSZonomi(),
	}
}

// GetAll returns all the configured providers
func GetAll() map[string]Provider {
	mp := make(map[string]Provider)
	items := List()
	for _, item := range items {
		mp[item.Title] = item
	}
	return mp
}

// Get returns a single provider by name
func Get(provider string) (Provider, error) {
	all := GetAll()
	if item, found := all[provider]; found {
		return item, nil
	}
	return Provider{}, errors.ErrProviderNotFound
}
