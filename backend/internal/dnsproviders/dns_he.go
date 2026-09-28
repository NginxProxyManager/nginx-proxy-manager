package dnsproviders

func getDNSHe() Provider {
	return Provider{
		Title:                "dns_he",
		Type:                 typeObject,
		AdditionalProperties: false,
		Required: []string{
			"HE_Username",
			"HE_Password",
		},
		Properties: map[string]providerField{
			"HE_Username": {
				Title:     titleUsername,
				Type:      typeString,
				MinLength: 1,
			},
			"HE_Password": {
				Title:     titlePassword,
				Type:      typeString,
				MinLength: 1,
				IsSecret:  true,
			},
		},
	}
}
