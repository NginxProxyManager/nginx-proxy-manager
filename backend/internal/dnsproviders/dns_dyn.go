package dnsproviders

func getDNSDyn() Provider {
	return Provider{
		Title:                "dns_dyn",
		Type:                 "object",
		AdditionalProperties: false,
		Required: []string{
			"DYN_Customer",
			"DYN_Username",
			"DYN_Password",
		},
		Properties: map[string]providerField{
			"DYN_Customer": {
				Title:     "customer",
				Type:      "string",
				MinLength: 1,
			},
			"DYN_Username": {
				Title:     "username",
				Type:      "string",
				MinLength: 1,
			},
			"DYN_Password": {
				Title:     "password",
				Type:      "string",
				MinLength: 1,
				IsSecret:  true,
			},
		},
	}
}
