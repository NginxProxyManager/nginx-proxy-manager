package dnsproviders

func getDNSOne() Provider {
	return Provider{
		Title:                "dns_nsone",
		Type:                 typeObject,
		AdditionalProperties: false,
		Required: []string{
			"NS1_Key",
		},
		Properties: map[string]providerField{
			"NS1_Key": {
				Title:     titleKey,
				Type:      typeString,
				MinLength: 1,
				IsSecret:  true,
			},
		},
	}
}
