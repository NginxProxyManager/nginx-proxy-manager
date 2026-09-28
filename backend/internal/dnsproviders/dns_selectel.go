package dnsproviders

func getDNSSelectel() Provider {
	return Provider{
		Title:                "dns_selectel",
		Type:                 typeObject,
		AdditionalProperties: false,
		Required: []string{
			"SL_Key",
		},
		Properties: map[string]providerField{
			"SL_Key": {
				Title:     titleAPIKey,
				Type:      typeString,
				MinLength: 1,
				IsSecret:  true,
			},
		},
	}
}
