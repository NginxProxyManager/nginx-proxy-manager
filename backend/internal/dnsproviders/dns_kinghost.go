package dnsproviders

const kinghostSchema = `
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

func getDNSKinghost() Provider {
	return Provider{
		AcmeshName: "dns_kinghost",
		Schema:     kinghostSchema,
		Fields: []providerField{
			{
				Name:       "User",
				Type:       "text",
				MetaKey:    "user",
				EnvKey:     "KINGHOST_Username",
				IsRequired: true,
			},
			{
				Name:       "Password",
				Type:       "password",
				MetaKey:    "password",
				EnvKey:     "KINGHOST_Password",
				IsRequired: true,
				IsSecret:   true,
			},
		},
	}
}
