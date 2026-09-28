package dnsproviders

func getDNSDgon() Provider {
	return Provider{
		Title:                "dns_dgon",
		Type:                 typeObject,
		AdditionalProperties: false,
		Required: []string{
			"DO_API_KEY",
		},
		Properties: map[string]providerField{
			"DO_API_KEY": {
				Title:    titleAPIKey,
				Type:     typeString,
				IsSecret: true,
			},
		},
	}
}
