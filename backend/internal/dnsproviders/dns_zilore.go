package dnsproviders

func getDNSDNZilore() Provider {
	return Provider{
		Title:                "dns_zilore",
		AdditionalProperties: false,
		Required: []string{
			"Zilore_Key",
		},
		Properties: map[string]providerField{
			"Zilore_Key": {
				Title:     "api-key",
				Type:      "string",
				MinLength: 1,
				IsSecret:  true,
			},
		},
	}
}
