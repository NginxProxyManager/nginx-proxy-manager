package dnsproviders

func getDNSAutoDNS() Provider {
	return Provider{
		Title:                "dns_autodns",
		Type:                 typeObject,
		AdditionalProperties: false,
		Required: []string{
			"AUTODNS_USER",
			"AUTODNS_PASSWORD",
			"AUTODNS_CONTEXT",
		},
		Properties: map[string]providerField{
			"AUTODNS_USER": {
				Title:     titleUser,
				Type:      typeString,
				MinLength: 1,
			},
			"AUTODNS_PASSWORD": {
				Title:     titlePassword,
				Type:      typeString,
				MinLength: 1,
				IsSecret:  true,
			},
			"AUTODNS_CONTEXT": {
				Title:     "context",
				Type:      typeString,
				MinLength: 1,
			},
		},
	}
}
