package dnsproviders

// nolint: gosec
const commonUserPassSchema = `
{
	"type": "object",
	"required": [
		"username",
		"password"
	],
	"additionalProperties": false,
	"properties": {
		"username": {
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

func getDNSHe() Provider {
	return Provider{
		AcmeshName: "dns_he",
		Schema:     commonUserPassSchema,
		Fields: []providerField{
			{
				Name:       "Username",
				Type:       "text",
				MetaKey:    "username",
				EnvKey:     "HE_Username",
				IsRequired: true,
			},
			{
				Name:       "Password",
				Type:       "password",
				MetaKey:    "password",
				EnvKey:     "HE_Password",
				IsRequired: true,
				IsSecret:   true,
			},
		},
	}
}
