package dnsproviders

func getDNSKinghost() Provider {
	return Provider{
		Title:                "dns_kinghost",
		Type:                 "object",
		AdditionalProperties: false,
		Required: []string{
			"KINGHOST_Username",
			"KINGHOST_Password",
		},
		Properties: map[string]providerField{
			"KINGHOST_Username": {
				Title:     "user",
				Type:      "string",
				MinLength: 1,
			},
			"KINGHOST_Password": {
				Title:     "password",
				Type:      "string",
				MinLength: 1,
				IsSecret:  true,
			},
		},
	}
}
