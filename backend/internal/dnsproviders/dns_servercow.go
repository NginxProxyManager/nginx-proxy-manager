package dnsproviders

func getDNSServercow() Provider {
	return Provider{
		Title:                "dns_servercow",
		Type:                 "object",
		AdditionalProperties: false,
		Required: []string{
			"SERVERCOW_API_Username",
			"SERVERCOW_API_Password",
		},
		Properties: map[string]providerField{
			"SERVERCOW_API_Username": {
				Title:     "user",
				Type:      "string",
				MinLength: 1,
			},
			"SERVERCOW_API_Password": {
				Title:     "password",
				Type:      "string",
				MinLength: 1,
				IsSecret:  true,
			},
		},
	}
}
