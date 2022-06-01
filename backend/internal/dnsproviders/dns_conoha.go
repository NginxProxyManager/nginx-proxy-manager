package dnsproviders

const conohaSchema = `
{
	"type": "object",
	"required": [
		"subscription_id",
		"tenant_id",
		"app_id",
		"client_secret"
	],
	"additionalProperties": false,
	"properties": {
		"api_url": {
			"type": "string",
			"minLength": 4
		},
		"user": {
			"type": "string",
			"minLength": 1
		},
		"pass": {
			"type": "string",
			"minLength": 1
		},
		"tenant_id": {
			"type": "string",
			"minLength": 1
		}
	}
}
`

func getDNSConoha() Provider {
	return Provider{
		AcmeshName: "dns_conoha",
		Schema:     conohaSchema,
		Fields: []providerField{
			{
				Name:       "API URL",
				Type:       "text",
				MetaKey:    "api_url",
				EnvKey:     "CONOHA_IdentityServiceApi",
				IsRequired: true,
			},
			{
				Name:       "Username",
				Type:       "text",
				MetaKey:    "user",
				EnvKey:     "CONOHA_Username",
				IsRequired: true,
			},
			{
				Name:       "Password",
				Type:       "password",
				MetaKey:    "password",
				EnvKey:     "CONOHA_Password",
				IsRequired: true,
				IsSecret:   true,
			},
			{
				Name:       "Tenant ID",
				Type:       "text",
				MetaKey:    "tenant_id",
				EnvKey:     "CONOHA_TenantId",
				IsRequired: true,
			},
		},
	}
}
