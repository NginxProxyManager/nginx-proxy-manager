package dnsproviders

const ispConfigSchema = `
{
	"type": "object",
	"required": [
		"user",
		"password",
		"api_url"
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
		},
		"api_url": {
			"type": "string",
			"minLength": 1
		},
		"insecure": {
			"type": "string"
		}
	}
}
`

func getDNSIspconfig() Provider {
	return Provider{
		AcmeshName: "dns_ispconfig",
		Schema:     ispConfigSchema,
		Fields: []providerField{
			{
				Name:       "User",
				Type:       "text",
				MetaKey:    "user",
				EnvKey:     "ISPC_User",
				IsRequired: true,
			},
			{
				Name:       "Password",
				Type:       "password",
				MetaKey:    "password",
				EnvKey:     "ISPC_Password",
				IsRequired: true,
				IsSecret:   true,
			},
			{
				Name:       "API URL",
				Type:       "text",
				MetaKey:    "api_url",
				EnvKey:     "ISPC_Api",
				IsRequired: true,
			},
			{
				Name:    "Insecure",
				Type:    "bool",
				MetaKey: "insecure",
				EnvKey:  "ISPC_Api_Insecure",
			},
		},
	}
}
