package dnsproviders

func getDNSLua() Provider {
	return Provider{
		Title:                "dns_lua",
		Type:                 typeObject,
		AdditionalProperties: false,
		Required: []string{
			"LUA_Key",
			"LUA_Email",
		},
		Properties: map[string]providerField{
			"LUA_Key": {
				Title:     titleKey,
				Type:      typeString,
				MinLength: 1,
				IsSecret:  true,
			},
			"LUA_Email": {
				Title:     "email",
				Type:      typeString,
				MinLength: 5,
			},
		},
	}
}
