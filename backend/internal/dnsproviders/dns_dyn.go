package dnsproviders

func getDNSDyn() Provider {
	return Provider{
		Title:                "dns_dyn",
		Type:                 typeObject,
		AdditionalProperties: false,
		Required: []string{
			"DYN_Customer",
			"DYN_Username",
			"DYN_Password",
		},
		Properties: map[string]providerField{
			"DYN_Customer": {
				Title:     "customer",
				Type:      typeString,
				MinLength: 1,
			},
			"DYN_Username": {
				Title:     titleUsername,
				Type:      typeString,
				MinLength: 1,
			},
			"DYN_Password": {
				Title:     titlePassword,
				Type:      typeString,
				MinLength: 1,
				IsSecret:  true,
			},
		},
	}
}
