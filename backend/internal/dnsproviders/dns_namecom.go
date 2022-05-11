package dnsproviders

const nameComSchema = `
{
	"type": "object",
	"required": [
		"username",
		"token"
	],
	"additionalProperties": false,
	"properties": {
		"username": {
			"type": "string",
			"minLength": 1
		},
		"token": {
			"type": "string",
			"minLength": 1
		}
	}
}
`

func getDNSNamecom() Provider {
	return Provider{
		AcmeshName: "dns_namecom",
		Schema:     nameComSchema,
		Fields: []providerField{
			{
				Name:       "Username",
				Type:       "text",
				MetaKey:    "username",
				EnvKey:     "Namecom_Username",
				IsRequired: true,
			},
			{
				Name:       "Token",
				Type:       "text",
				MetaKey:    "token",
				EnvKey:     "Namecom_Token",
				IsRequired: true,
				IsSecret:   true,
			},
		},
	}
}
