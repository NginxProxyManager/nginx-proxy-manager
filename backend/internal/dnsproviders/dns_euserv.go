package dnsproviders

const euservSchema = `
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
		},
		"otp_secret": {
			"type": "string",
			"minLength": 1
		}
	}
}
`

func getDNSEuserv() Provider {
	return Provider{
		AcmeshName: "dns_euserv",
		Schema:     euservSchema,
		Fields: []providerField{
			{
				Name:       "User",
				Type:       "text",
				MetaKey:    "user",
				EnvKey:     "EUSERV_Username",
				IsRequired: true,
			},
			{
				Name:       "Password",
				Type:       "password",
				MetaKey:    "password",
				EnvKey:     "EUSERV_Password",
				IsRequired: true,
				IsSecret:   true,
			},
		},
	}
}
