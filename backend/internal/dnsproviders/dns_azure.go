package dnsproviders

const azureSchema = `
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
		"subscription_id": {
			"type": "string",
			"minLength": 1
		},
		"tenant_id": {
			"type": "string",
			"minLength": 1
		},
		"app_id": {
			"type": "string",
			"minLength": 1
		},
		"client_secret": {
			"type": "string",
			"minLength": 1
		}
	}
}
`

func getDNSAzure() Provider {
	return Provider{
		AcmeshName: "dns_azure",
		Schema:     azureSchema,
		Fields: []providerField{
			{
				Name:       "Subscription ID",
				Type:       "text",
				MetaKey:    "subscription_id",
				EnvKey:     "AZUREDNS_SUBSCRIPTIONID",
				IsRequired: true,
			},
			{
				Name:       "Tenant ID",
				Type:       "text",
				MetaKey:    "tenant_id",
				EnvKey:     "AZUREDNS_TENANTID",
				IsRequired: true,
			},
			{
				Name:       "APP ID",
				Type:       "text",
				MetaKey:    "app_id",
				EnvKey:     "AZUREDNS_APPID",
				IsRequired: true,
			},
			{
				Name:       "Client Secret",
				Type:       "password",
				MetaKey:    "client_secret",
				EnvKey:     "AZUREDNS_CLIENTSECRET",
				IsRequired: true,
				IsSecret:   true,
			},
		},
	}
}
