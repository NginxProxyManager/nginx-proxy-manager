package dnsproviders

const dnsPodCnSchema = `
{
	"type": "object",
	"required": [
		"id",
		"api_key"
	],
	"additionalProperties": false,
	"properties": {
		"id": {
			"type": "string",
			"minLength": 1
		},
		"api_key": {
			"type": "string",
			"minLength": 1
		}
	}
}
`

func getDNSDp() Provider {
	return Provider{
		AcmeshName: "dns_dp",
		Schema:     dnsPodCnSchema,
		Fields: []providerField{
			{
				Name:       "ID",
				Type:       "text",
				MetaKey:    "id",
				EnvKey:     "DP_Id",
				IsRequired: true,
			},
			{
				Name:       "Key",
				Type:       "password",
				MetaKey:    "api_key",
				EnvKey:     "DP_Key",
				IsRequired: true,
				IsSecret:   true,
			},
		},
	}
}
