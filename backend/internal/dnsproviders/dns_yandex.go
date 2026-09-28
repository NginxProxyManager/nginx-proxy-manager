package dnsproviders

func getDNSYandex() Provider {
	return Provider{
		Title:                "dns_yandex",
		Type:                 typeObject,
		AdditionalProperties: false,
		Required: []string{
			"PDD_Token",
		},
		Properties: map[string]providerField{
			"PDD_Token": {
				Title:     titleToken,
				Type:      typeString,
				MinLength: 1,
				IsSecret:  true,
			},
		},
	}
}
