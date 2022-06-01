package dnsproviders

const acmeDNSchema = `
{
	"type": "object",
	"required": [
		"api_url",
		"user",
		"password"
	],
	"additionalProperties": false,
	"properties": {
		"api_url": {
			"type": "string",
			"minLength": 4
		},
		"subdomain": {
			"type": "string",
			"minLength": 1
		},
		"user": {
			"type": "string",
			"minLength": 1
		},
		"password": {
			"type": "string",
			"minLength": 1
		}
	}
}
`

func getDNSAcmeDNS() Provider {
	return Provider{
		AcmeshName: "dns_acmedns",
		Schema:     acmeDNSchema,
		Fields: []providerField{
			{
				Name:       "Base URL",
				Type:       "text",
				MetaKey:    "api_url",
				EnvKey:     "ACMEDNS_BASE_URL",
				IsRequired: true,
			},
			{
				Name:       "Subdomain",
				Type:       "text",
				MetaKey:    "subdomain",
				EnvKey:     "ACMEDNS_SUBDOMAIN",
				IsRequired: true,
			},
			{
				Name:       "User",
				Type:       "text",
				MetaKey:    "user",
				EnvKey:     "ACMEDNS_USERNAME",
				IsRequired: true,
			},
			{
				Name:       "Password",
				Type:       "password",
				MetaKey:    "password",
				EnvKey:     "ACMEDNS_PASSWORD",
				IsRequired: true,
				IsSecret:   true,
			},
		},
	}
}
