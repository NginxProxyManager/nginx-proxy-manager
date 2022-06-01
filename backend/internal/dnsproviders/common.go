package dnsproviders

import (
	"errors"
	"npm/internal/util"
)

type providerField struct {
	Name       string `json:"name"`
	Type       string `json:"type"`
	IsRequired bool   `json:"is_required"`
	IsSecret   bool   `json:"is_secret"`
	MetaKey    string `json:"meta_key"`
	EnvKey     string `json:"-"` // not exposed in api
}

// Provider is a simple struct
type Provider struct {
	AcmeshName string          `json:"acmesh_name"`
	Schema     string          `json:"-"`
	Fields     []providerField `json:"fields"`
}

// GetAcmeEnvVars will map the meta given to the env var required for
// acme.sh to use this dns provider
func (p *Provider) GetAcmeEnvVars(meta interface{}) map[string]string {
	res := make(map[string]string)
	for _, field := range p.Fields {
		if acmeShEnvValue, found := util.FindItemInInterface(field.MetaKey, meta); found {
			res[field.EnvKey] = acmeShEnvValue.(string)
		}
	}
	return res
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
		getDNSCx(),
		getDNSCyon(),
		getDNSDgon(),
		getDNSDNSimple(),
		getDNSDa(),
		getDNSDp(),
		getDNSDreamhost(),
		getDNSDuckDNS(),
		getDNSDyn(),
		getDNSDynu(),
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
		getDNSMe(),
		getDNSNamecom(),
		getDNSNamesilo(),
		getDNSSelectel(),
		getDNSServercow(),
		getDNSOne(),
		getDNSPDNS(),
		getDNSUnoeuro(),
		getDNSVscale(),
		getDNSYandex(),
		getDNSDNZilore(),
		getDNSZonomi(),
	}
}

// GetAll returns all the configured providers
func GetAll() map[string]Provider {
	mp := make(map[string]Provider)
	items := List()
	for _, item := range items {
		mp[item.AcmeshName] = item
	}
	return mp
}

// Get returns a single provider by name
func Get(provider string) (Provider, error) {
	all := GetAll()
	if item, found := all[provider]; found {
		return item, nil
	}
	return Provider{}, errors.New("provider_not_found")
}

// GetAllSchemas returns a flat array with just the schemas
func GetAllSchemas() []string {
	items := List()
	mp := make([]string, 0)
	for _, item := range items {
		mp = append(mp, item.Schema)
	}
	return mp
}

const commonKeySchema = `
{
	"type": "object",
	"required": [
		"api_key"
	],
	"additionalProperties": false,
	"properties": {
		"api_key": {
			"type": "string",
			"minLength": 1
		}
	}
}
`

// nolint: gosec
const commonKeySecretSchema = `
{
	"type": "object",
	"required": [
		"api_key",
		"secret"
	],
	"additionalProperties": false,
	"properties": {
		"api_key": {
			"type": "string",
			"minLength": 1
		},
		"secret": {
			"type": "string",
			"minLength": 1
		}
	}
}
`
