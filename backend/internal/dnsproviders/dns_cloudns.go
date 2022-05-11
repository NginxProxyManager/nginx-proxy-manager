package dnsproviders

const clouDNSNetSchema = `
{
	"type": "object",
	"required": [
		"password"
	],
	"additionalProperties": false,
	"properties": {
		"auth_id": {
			"type": "string",
			"minLength": 1
		},
		"sub_auth_id": {
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

func getDNSCloudns() Provider {
	return Provider{
		AcmeshName: "dns_cloudns",
		Schema:     clouDNSNetSchema,
		Fields: []providerField{
			{
				Name:    "Auth ID",
				Type:    "text",
				MetaKey: "auth_id",
				EnvKey:  "CLOUDNS_AUTH_ID",
			},
			{
				Name:    "Sub Auth ID",
				Type:    "text",
				MetaKey: "sub_auth_id",
				EnvKey:  "CLOUDNS_SUB_AUTH_ID",
			},
			{
				Name:       "Password",
				Type:       "password",
				MetaKey:    "password",
				EnvKey:     "CLOUDNS_AUTH_PASSWORD",
				IsRequired: true,
				IsSecret:   true,
			},
		},
	}
}
