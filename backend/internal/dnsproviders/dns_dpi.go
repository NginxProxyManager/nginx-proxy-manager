package dnsproviders

const dnsPodComSchema = `
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

func getDNSDpi() Provider {
	return Provider{
		AcmeshName: "dns_dpi",
		Schema:     dnsPodComSchema,
		Fields: []providerField{
			{
				Name:       "ID",
				Type:       "text",
				MetaKey:    "id",
				EnvKey:     "DPI_Id",
				IsRequired: true,
			},
			{
				Name:       "Key",
				Type:       "password",
				MetaKey:    "api_key",
				EnvKey:     "DPI_Key",
				IsRequired: true,
				IsSecret:   true,
			},
		},
	}
}
