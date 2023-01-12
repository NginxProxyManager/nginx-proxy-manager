package dnsproviders

func getDNSZonomi() Provider {
	return Provider{
		Title:                "dns_zonomi",
		AdditionalProperties: false,
		Required: []string{
			"ZM_Key",
		},
		Properties: map[string]providerField{
			"ZM_Key": {
				Title:     "api-key",
				Type:      "string",
				MinLength: 1,
				IsSecret:  true,
			},
		},
	}
}
