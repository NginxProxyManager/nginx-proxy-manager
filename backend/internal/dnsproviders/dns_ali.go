package dnsproviders

func getDNSAli() Provider {
	return Provider{
		Title:                "dns_ali",
		Type:                 "object",
		AdditionalProperties: false,
		Required: []string{
			"Ali_Key",
			"Ali_Secret",
		},
		Properties: map[string]providerField{
			"Ali_Key": {
				Title:     "api-key",
				Type:      "string",
				MinLength: 1,
			},
			"Ali_Secret": {
				Title:     "secret",
				Type:      "string",
				MinLength: 1,
				IsSecret:  true,
			},
		},
	}
}
