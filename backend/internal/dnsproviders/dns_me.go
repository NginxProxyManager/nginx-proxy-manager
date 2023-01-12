package dnsproviders

func getDNSMe() Provider {
	return Provider{
		Title:                "dns_me",
		Type:                 "object",
		AdditionalProperties: false,
		Required: []string{
			"ME_Key",
			"ME_Secret",
		},
		Properties: map[string]providerField{
			"ME_Key": {
				Title:     "key",
				Type:      "string",
				MinLength: 1,
			},
			"ME_Secret": {
				Title:     "secret",
				Type:      "string",
				MinLength: 1,
				IsSecret:  true,
			},
		},
	}
}
