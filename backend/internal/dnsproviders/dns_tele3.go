package dnsproviders

func getDNSTele3() Provider {
	return Provider{
		Title:                "dns_tele3",
		Type:                 typeObject,
		AdditionalProperties: false,
		Required: []string{
			"TELE3_Key",
			"TELE3_Secret",
		},
		Properties: map[string]providerField{
			"TELE3_Key": {
				Title:     titleKey,
				Type:      typeString,
				MinLength: 1,
			},
			"TELE3_Secret": {
				Title:     titleSecret,
				Type:      typeString,
				MinLength: 1,
				IsSecret:  true,
			},
		},
	}
}
