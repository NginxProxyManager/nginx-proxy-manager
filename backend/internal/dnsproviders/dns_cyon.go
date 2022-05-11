package dnsproviders

const cyonChSchema = `
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

func getDNSCyon() Provider {
	return Provider{
		AcmeshName: "dns_cyon",
		Schema:     cyonChSchema,
		Fields: []providerField{
			{
				Name:       "User",
				Type:       "text",
				MetaKey:    "user",
				EnvKey:     "CY_Username",
				IsRequired: true,
			},
			{
				Name:       "Password",
				Type:       "password",
				MetaKey:    "password",
				EnvKey:     "CY_Password",
				IsRequired: true,
				IsSecret:   true,
			},
			{
				Name:     "OTP Secret",
				Type:     "password",
				MetaKey:  "otp_secret",
				EnvKey:   "CY_OTP_Secret",
				IsSecret: true,
			},
		},
	}
}
