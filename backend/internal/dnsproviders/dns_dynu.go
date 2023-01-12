package dnsproviders

func getDNSDynu() Provider {
	return Provider{
		Title:                "dns_dynu",
		Type:                 "object",
		AdditionalProperties: false,
		Required: []string{
			"Dynu_ClientId",
		},
		Properties: map[string]providerField{
			"Dynu_ClientId": {
				Title:     "client-id",
				Type:      "string",
				MinLength: 1,
			},
			"Dynu_Secret": {
				Title:     "secret",
				Type:      "string",
				MinLength: 1,
				IsSecret:  true,
			},
		},
	}
}
