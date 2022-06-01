package dnsproviders

const daSchema = `
{
	"type": "object",
	"required": [
		"api_url"
	],
	"additionalProperties": false,
	"properties": {
		"api_url": {
			"type": "string",
			"minLength": 4
		},
		"insecure": {
			"type": "boolean"
		}
	}
}
`

func getDNSDa() Provider {
	return Provider{
		AcmeshName: "dns_da",
		Schema:     daSchema,
		Fields: []providerField{
			{
				Name:       "API URL",
				Type:       "text",
				MetaKey:    "api_url",
				EnvKey:     "DA_Api",
				IsRequired: true,
			},
			{
				Name:    "Insecure",
				Type:    "bool",
				MetaKey: "insecure",
				EnvKey:  "DA_Api_Insecure",
			},
		},
	}
}
