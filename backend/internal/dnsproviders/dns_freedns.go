package dnsproviders

const freeDNSSchema = `
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

func getDNSFreeDNS() Provider {
	return Provider{
		AcmeshName: "dns_freedns",
		Schema:     freeDNSSchema,
		Fields: []providerField{
			{
				Name:       "User",
				Type:       "text",
				MetaKey:    "user",
				EnvKey:     "FREEDNS_User",
				IsRequired: true,
			},
			{
				Name:       "Password",
				Type:       "password",
				MetaKey:    "password",
				EnvKey:     "FREEDNS_Password",
				IsRequired: true,
				IsSecret:   true,
			},
		},
	}
}
