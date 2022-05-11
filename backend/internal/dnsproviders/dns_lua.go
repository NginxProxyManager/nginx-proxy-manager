package dnsproviders

const luaDNSSchema = `
{
	"type": "object",
	"required": [
		"api_key",
		"email"
	],
	"additionalProperties": false,
	"properties": {
		"api_key": {
			"type": "string",
			"minLength": 1
		},
		"email": {
			"type": "string",
			"minLength": 5
		}
	}
}
`

func getDNSLua() Provider {
	return Provider{
		AcmeshName: "dns_lua",
		Schema:     luaDNSSchema,
		Fields: []providerField{
			{
				Name:       "Key",
				Type:       "text",
				MetaKey:    "api_key",
				EnvKey:     "LUA_Key",
				IsRequired: true,
				IsSecret:   true,
			},
			{
				Name:       "Email",
				Type:       "text",
				MetaKey:    "email",
				EnvKey:     "LUA_Email",
				IsRequired: true,
			},
		},
	}
}
