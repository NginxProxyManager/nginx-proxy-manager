package dnsproviders

const servercowSchema = `
{
	"type": "object",
	"required": [
		"user",
		"password"
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
		}
	}
}
`

func getDNSServercow() Provider {
	return Provider{
		AcmeshName: "dns_servercow",
		Schema:     servercowSchema,
		Fields: []providerField{
			{
				Name:       "User",
				Type:       "text",
				MetaKey:    "user",
				EnvKey:     "SERVERCOW_API_Username",
				IsRequired: true,
			},
			{
				Name:       "Password",
				Type:       "password",
				MetaKey:    "password",
				EnvKey:     "SERVERCOW_API_Password",
				IsRequired: true,
				IsSecret:   true,
			},
		},
	}
}
