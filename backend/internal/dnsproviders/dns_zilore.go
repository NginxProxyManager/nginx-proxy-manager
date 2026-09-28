package dnsproviders

func getDNSDNZilore() Provider {
	return Provider{
		Title:                "dns_zilore",
		Type:                 typeObject,
		AdditionalProperties: false,
		Required: []string{
			"Zilore_Key",
		},
		Properties: map[string]providerField{
			"Zilore_Key": {
				Title:     titleAPIKey,
				Type:      typeString,
				MinLength: 1,
				IsSecret:  true,
			},
		},
	}
}
