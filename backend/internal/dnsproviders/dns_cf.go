package dnsproviders

const cloudflareSchema = `
{
	"type": "object",
	"required": [
		"api_key",
		"email",
		"token",
		"account_id"
	],
	"additionalProperties": false,
	"properties": {
		"api_key": {
			"type": "string",
			"minLength": 1
		},
		"email": {
			"type": "string",
			"minLength": 5
		},
		"token": {
			"type": "string",
			"minLength": 5
		},
		"account_id": {
			"type": "string",
			"minLength": 1
		},
		"zone_id": {
			"type": "string",
			"minLength": 1
		}
	}
}
`

func getDNSCf() Provider {
	return Provider{
		AcmeshName: "dns_cf",
		Schema:     cloudflareSchema,
		Fields: []providerField{
			{
				Name:       "API Key",
				Type:       "password",
				MetaKey:    "api_key",
				EnvKey:     "CF_Key",
				IsRequired: true,
			},
			{
				Name:       "Email",
				Type:       "text",
				MetaKey:    "email",
				EnvKey:     "CF_Email",
				IsRequired: true,
			},
			{
				Name:       "Token",
				Type:       "text",
				MetaKey:    "token",
				EnvKey:     "CF_Token",
				IsRequired: true,
				IsSecret:   true,
			},
			{
				Name:       "Account ID",
				Type:       "text",
				MetaKey:    "account_id",
				EnvKey:     "CF_Account_ID",
				IsRequired: true,
			},
			{
				Name:    "Zone ID",
				Type:    "string",
				MetaKey: "zone_id",
				EnvKey:  "CF_Zone_ID",
			},
		},
	}
}
