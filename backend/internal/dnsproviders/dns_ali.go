package dnsproviders

func getDNSAli() Provider {
	return Provider{
		Title:                "dns_ali",
		Type:                 typeObject,
		AdditionalProperties: false,
		Required: []string{
			"Ali_Key",
			"Ali_Secret",
		},
		Properties: map[string]providerField{
			"Ali_Key": {
				Title:     titleAPIKey,
				Type:      typeString,
				MinLength: 1,
			},
			"Ali_Secret": {
				Title:     titleSecret,
				Type:      typeString,
				MinLength: 1,
				IsSecret:  true,
			},
		},
	}
}
