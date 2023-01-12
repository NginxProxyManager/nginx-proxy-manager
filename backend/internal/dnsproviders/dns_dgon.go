package dnsproviders

func getDNSDgon() Provider {
	return Provider{
		Title:                "dns_dgon",
		Type:                 "object",
		AdditionalProperties: false,
		Required: []string{
			"DO_API_KEY",
		},
		Properties: map[string]providerField{
			"DO_API_KEY": {
				Title:    "api-key",
				Type:     "string",
				IsSecret: true,
			},
		},
	}
}
