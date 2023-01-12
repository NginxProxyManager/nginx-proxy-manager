package dnsproviders

func getDNSYandex() Provider {
	return Provider{
		Title:                "dns_yandex",
		AdditionalProperties: false,
		Required: []string{
			"PDD_Token",
		},
		Properties: map[string]providerField{
			"PDD_Token": {
				Title:     "token",
				Type:      "string",
				MinLength: 1,
				IsSecret:  true,
			},
		},
	}
}
