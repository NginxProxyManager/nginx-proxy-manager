package dnsproviders

func getDNSNamesilo() Provider {
	return Provider{
		Title:                "dns_namesilo",
		Type:                 typeObject,
		AdditionalProperties: false,
		Required: []string{
			"Namesilo_Key",
		},
		Properties: map[string]providerField{
			"Namesilo_Key": {
				Title:     titleAPIKey,
				Type:      typeString,
				MinLength: 1,
				IsSecret:  true,
			},
		},
	}
}
