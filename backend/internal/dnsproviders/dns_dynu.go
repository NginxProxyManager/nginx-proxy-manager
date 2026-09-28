package dnsproviders

func getDNSDynu() Provider {
	return Provider{
		Title:                "dns_dynu",
		Type:                 typeObject,
		AdditionalProperties: false,
		Required: []string{
			"Dynu_ClientId",
		},
		Properties: map[string]providerField{
			"Dynu_ClientId": {
				Title:     "client-id",
				Type:      typeString,
				MinLength: 1,
			},
			"Dynu_Secret": {
				Title:     titleSecret,
				Type:      typeString,
				MinLength: 1,
				IsSecret:  true,
			},
		},
	}
}
