package dnsproviders

const inwxSchema = `
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

func getDNSInwx() Provider {
	return Provider{
		AcmeshName: "dns_inwx",
		Schema:     inwxSchema,
		Fields: []providerField{
			{
				Name:       "User",
				Type:       "text",
				MetaKey:    "user",
				EnvKey:     "INWX_User",
				IsRequired: true,
			},
			{
				Name:       "Password",
				Type:       "password",
				MetaKey:    "password",
				EnvKey:     "INWX_Password",
				IsRequired: true,
				IsSecret:   true,
			},
		},
	}
}
