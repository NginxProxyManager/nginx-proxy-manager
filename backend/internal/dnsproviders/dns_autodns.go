package dnsproviders

func getDNSAutoDNS() Provider {
	return Provider{
		Title:                "dns_autodns",
		Type:                 "object",
		AdditionalProperties: false,
		Required: []string{
			"AUTODNS_USER",
			"AUTODNS_PASSWORD",
			"AUTODNS_CONTEXT",
		},
		Properties: map[string]providerField{
			"AUTODNS_USER": {
				Title:     "user",
				Type:      "string",
				MinLength: 1,
			},
			"AUTODNS_PASSWORD": {
				Title:     "password",
				Type:      "string",
				MinLength: 1,
				IsSecret:  true,
			},
			"AUTODNS_CONTEXT": {
				Title:     "context",
				Type:      "string",
				MinLength: 1,
			},
		},
	}
}
