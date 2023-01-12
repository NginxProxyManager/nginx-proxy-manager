package dnsproviders

func getDNSOne() Provider {
	return Provider{
		Title:                "dns_nsone",
		AdditionalProperties: false,
		Required: []string{
			"NS1_Key",
		},
		Properties: map[string]providerField{
			"NS1_Key": {
				Title:     "key",
				Type:      "string",
				MinLength: 1,
				IsSecret:  true,
			},
		},
	}
}
