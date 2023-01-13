package dnsproviders

func getDNSSelectel() Provider {
	return Provider{
		Title:                "dns_selectel",
		Type:                 "object",
		AdditionalProperties: false,
		Required: []string{
			"SL_Key",
		},
		Properties: map[string]providerField{
			"SL_Key": {
				Title:     "api-key",
				Type:      "string",
				MinLength: 1,
				IsSecret:  true,
			},
		},
	}
}
