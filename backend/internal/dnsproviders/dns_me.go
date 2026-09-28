package dnsproviders

func getDNSMe() Provider {
	return Provider{
		Title:                "dns_me",
		Type:                 typeObject,
		AdditionalProperties: false,
		Required: []string{
			"ME_Key",
			"ME_Secret",
		},
		Properties: map[string]providerField{
			"ME_Key": {
				Title:     titleKey,
				Type:      typeString,
				MinLength: 1,
			},
			"ME_Secret": {
				Title:     titleSecret,
				Type:      typeString,
				MinLength: 1,
				IsSecret:  true,
			},
		},
	}
}
