package dnsproviders

func getDNSDreamhost() Provider {
	return Provider{
		Title:                "dns_dreamhost",
		Type:                 typeObject,
		AdditionalProperties: false,
		Required: []string{
			"DH_API_KEY",
		},
		Properties: map[string]providerField{
			"DH_API_KEY": {
				Title:     titleAPIKey,
				Type:      typeString,
				MinLength: 1,
				IsSecret:  true,
			},
		},
	}
}
