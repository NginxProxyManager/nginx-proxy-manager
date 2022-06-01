package dnsproviders

const loopiaSchema = `
{
	"type": "object",
	"required": [
		"api_url",
		"user",
		"password"
	],
	"additionalProperties": false,
	"properties": {
		"api_url": {
			"type": "string",
			"minLength": 4
		},
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

func getDNSLoopia() Provider {
	return Provider{
		AcmeshName: "dns_loopia",
		Schema:     loopiaSchema,
		Fields: []providerField{
			{
				Name:       "API URL",
				Type:       "text",
				MetaKey:    "api_url",
				EnvKey:     "LOOPIA_Api",
				IsRequired: true,
			},
			{
				Name:       "User",
				Type:       "text",
				MetaKey:    "user",
				EnvKey:     "LOOPIA_User",
				IsRequired: true,
			},
			{
				Name:       "Password",
				Type:       "password",
				MetaKey:    "password",
				EnvKey:     "LOOPIA_Password",
				IsRequired: true,
				IsSecret:   true,
			},
		},
	}
}
