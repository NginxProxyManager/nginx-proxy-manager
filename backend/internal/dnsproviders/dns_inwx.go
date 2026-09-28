package dnsproviders

func getDNSInwx() Provider {
	return Provider{
		Title:                "dns_inwx",
		Type:                 typeObject,
		AdditionalProperties: false,
		Required: []string{
			"INWX_User",
			"INWX_Password",
		},
		Properties: map[string]providerField{
			"INWX_User": {
				Title:     titleUser,
				Type:      typeString,
				MinLength: 1,
			},
			"INWX_Password": {
				Title:     titlePassword,
				Type:      typeString,
				MinLength: 1,
				IsSecret:  true,
			},
		},
	}
}
