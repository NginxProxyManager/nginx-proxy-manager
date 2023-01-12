package dnsproviders

func getDNSLua() Provider {
	return Provider{
		Title:                "dns_lua",
		Type:                 "object",
		AdditionalProperties: false,
		Required: []string{
			"LUA_Key",
			"LUA_Email",
		},
		Properties: map[string]providerField{
			"LUA_Key": {
				Title:     "key",
				Type:      "string",
				MinLength: 1,
				IsSecret:  true,
			},
			"LUA_Email": {
				Title:     "email",
				Type:      "string",
				MinLength: 5,
			},
		},
	}
}
