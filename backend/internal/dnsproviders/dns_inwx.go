package dnsproviders

func getDNSInwx() Provider {
	return Provider{
		Title:                "dns_inwx",
		Type:                 "object",
		AdditionalProperties: false,
		Required: []string{
			"INWX_User",
			"INWX_Password",
		},
		Properties: map[string]providerField{
			"INWX_User": {
				Title:     "user",
				Type:      "string",
				MinLength: 1,
			},
			"INWX_Password": {
				Title:     "password",
				Type:      "string",
				MinLength: 1,
				IsSecret:  true,
			},
		},
	}
}
