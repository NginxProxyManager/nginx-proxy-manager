package dnsproviders

func getDNSEuserv() Provider {
	return Provider{
		Title:                "dns_euserv",
		Type:                 "object",
		AdditionalProperties: false,
		Required: []string{
			"EUSERV_Username",
			"EUSERV_Password",
		},
		Properties: map[string]providerField{
			"EUSERV_Username": {
				Title:     "user",
				Type:      "string",
				MinLength: 1,
			},
			"EUSERV_Password": {
				Title:     "password",
				Type:      "string",
				MinLength: 1,
				IsSecret:  true,
			},
		},
	}
}
