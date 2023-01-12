package dnsproviders

func getDNSFreeDNS() Provider {
	return Provider{
		Title:                "dns_freedns",
		Type:                 "object",
		AdditionalProperties: false,
		Required: []string{
			"FREEDNS_User",
			"FREEDNS_Password",
		},
		Properties: map[string]providerField{
			"FREEDNS_User": {
				Title:     "user",
				Type:      "string",
				MinLength: 1,
			},
			"FREEDNS_Password": {
				Title:     "password",
				Type:      "string",
				MinLength: 1,
				IsSecret:  true,
			},
		},
	}
}
