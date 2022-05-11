package dnsproviders

const unoEuroSchema = `
{
	"type": "object",
	"required": [
		"api_key",
		"user"
	],
	"additionalProperties": false,
	"properties": {
		"api_key": {
			"type": "string",
			"minLength": 1
		},
		"user": {
			"type": "string",
			"minLength": 1
		}
	}
}
`

func getDNSUnoeuro() Provider {
	return Provider{
		AcmeshName: "dns_unoeuro",
		Schema:     unoEuroSchema,
		Fields: []providerField{
			{
				Name:       "Key",
				Type:       "password",
				MetaKey:    "api_key",
				EnvKey:     "UNO_Key",
				IsRequired: true,
				IsSecret:   true,
			},
			{
				Name:       "User",
				Type:       "text",
				MetaKey:    "user",
				EnvKey:     "UNO_User",
				IsRequired: true,
				IsSecret:   true,
			},
		},
	}
}
