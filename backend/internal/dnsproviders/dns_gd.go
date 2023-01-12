package dnsproviders

func getDNSGd() Provider {
	return Provider{
		Title:                "dns_gd",
		Type:                 "object",
		AdditionalProperties: false,
		Required: []string{
			"GD_Key",
			"GD_Secret",
		},
		Properties: map[string]providerField{
			"GD_Key": {
				Title:     "key",
				Type:      "string",
				MinLength: 1,
			},
			"GD_Secret": {
				Title:     "secret",
				Type:      "string",
				MinLength: 1,
				IsSecret:  true,
			},
		},
	}
}
