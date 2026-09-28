package dnsproviders

func getDNSZonomi() Provider {
	return Provider{
		Title:                "dns_zonomi",
		Type:                 typeObject,
		AdditionalProperties: false,
		Required: []string{
			"ZM_Key",
		},
		Properties: map[string]providerField{
			"ZM_Key": {
				Title:     titleAPIKey,
				Type:      typeString,
				MinLength: 1,
				IsSecret:  true,
			},
		},
	}
}
