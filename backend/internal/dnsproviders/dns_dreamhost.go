package dnsproviders

func getDNSDreamhost() Provider {
	return Provider{
		Title:                "dns_dreamhost",
		Type:                 "object",
		AdditionalProperties: false,
		Required: []string{
			"DH_API_KEY",
		},
		Properties: map[string]providerField{
			"DH_API_KEY": {
				Title:     "api-key",
				Type:      "string",
				MinLength: 1,
				IsSecret:  true,
			},
		},
	}
}
