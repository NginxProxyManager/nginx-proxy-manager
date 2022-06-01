package dnsproviders

const autoDNSSchema = `
{
	"type": "object",
	"required": [
		"user",
		"password",
		"context"
	],
	"additionalProperties": false,
	"properties": {
		"user": {
			"type": "string",
			"minLength": 1
		},
		"password": {
			"type": "string",
			"minLength": 1
		},
		"context": {
			"type": "string",
			"minLength": 1
		}
	}
}
`

func getDNSAutoDNS() Provider {
	return Provider{
		AcmeshName: "dns_autodns",
		Schema:     autoDNSSchema,
		Fields: []providerField{
			{
				Name:       "User",
				Type:       "text",
				MetaKey:    "user",
				EnvKey:     "AUTODNS_USER",
				IsRequired: true,
			},
			{
				Name:       "Password",
				Type:       "password",
				MetaKey:    "password",
				EnvKey:     "AUTODNS_PASSWORD",
				IsRequired: true,
				IsSecret:   true,
			},
			{
				Name:       "Context",
				Type:       "string",
				MetaKey:    "context",
				EnvKey:     "AUTODNS_CONTEXT",
				IsRequired: true,
			},
		},
	}
}
