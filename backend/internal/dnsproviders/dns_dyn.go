package dnsproviders

const dynSchema = `
{
	"type": "object",
	"required": [
		"customer",
		"username",
		"password"
	],
	"additionalProperties": false,
	"properties": {
		"customer": {
			"type": "string",
			"minLength": 1
		},
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

func getDNSDyn() Provider {
	return Provider{
		AcmeshName: "dns_dyn",
		Schema:     dynSchema,
		Fields: []providerField{
			{
				Name:       "Customer",
				Type:       "text",
				MetaKey:    "customer",
				EnvKey:     "DYN_Customer",
				IsRequired: true,
			},
			{
				Name:       "Username",
				Type:       "text",
				MetaKey:    "username",
				EnvKey:     "DYN_Username",
				IsRequired: true,
			},
			{
				Name:       "Password",
				Type:       "password",
				MetaKey:    "password",
				EnvKey:     "DYN_Password",
				IsRequired: true,
				IsSecret:   true,
			},
		},
	}
}
