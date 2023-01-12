package dnsproviders

func getDNSNamesilo() Provider {
	return Provider{
		Title:                "dns_namesilo",
		AdditionalProperties: false,
		Required: []string{
			"Namesilo_Key",
		},
		Properties: map[string]providerField{
			"Namesilo_Key": {
				Title:     "api-key",
				Type:      "string",
				MinLength: 1,
				IsSecret:  true,
			},
		},
	}
}
