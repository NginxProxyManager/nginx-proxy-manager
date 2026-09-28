package dnsproviders

func getDNSGd() Provider {
	return Provider{
		Title:                "dns_gd",
		Type:                 typeObject,
		AdditionalProperties: false,
		Required: []string{
			"GD_Key",
			"GD_Secret",
		},
		Properties: map[string]providerField{
			"GD_Key": {
				Title:     titleKey,
				Type:      typeString,
				MinLength: 1,
			},
			"GD_Secret": {
				Title:     titleSecret,
				Type:      typeString,
				MinLength: 1,
				IsSecret:  true,
			},
		},
	}
}
