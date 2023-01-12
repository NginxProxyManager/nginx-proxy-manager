package dnsproviders

func getDNSHe() Provider {
	return Provider{
		Title:                "dns_he",
		Type:                 "object",
		AdditionalProperties: false,
		Required: []string{
			"HE_Username",
			"HE_Password",
		},
		Properties: map[string]providerField{
			"HE_Username": {
				Title:     "username",
				Type:      "string",
				MinLength: 1,
			},
			"HE_Password": {
				Title:     "password",
				Type:      "string",
				MinLength: 1,
				IsSecret:  true,
			},
		},
	}
}
