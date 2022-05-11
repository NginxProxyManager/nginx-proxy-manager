package dnsproviders

const infobloxSchema = `
{
	"type": "object",
	"required": [
		"credentials",
		"server"
	],
	"additionalProperties": false,
	"properties": {
		"credentials": {
			"type": "string",
			"minLength": 1
		},
		"server": {
			"type": "string",
			"minLength": 1
		}
	}
}
`

func getDNSInfoblox() Provider {
	return Provider{
		AcmeshName: "dns_infoblox",
		Schema:     infobloxSchema,
		Fields: []providerField{
			{
				Name:       "Credentials",
				Type:       "text",
				MetaKey:    "credentials",
				EnvKey:     "Infoblox_Creds",
				IsRequired: true,
				IsSecret:   true,
			},
			{
				Name:       "Server",
				Type:       "text",
				MetaKey:    "server",
				EnvKey:     "Infoblox_Server",
				IsRequired: true,
			},
		},
	}
}
