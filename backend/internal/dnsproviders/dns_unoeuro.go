package dnsproviders

func getDNSUnoeuro() Provider {
	return Provider{
		Title:                "dns_unoeuro",
		Type:                 "object",
		AdditionalProperties: false,
		Required: []string{
			"UNO_Key",
			"UNO_User",
		},
		Properties: map[string]providerField{
			"UNO_Key": {
				Title:     "key",
				Type:      "string",
				MinLength: 1,
				IsSecret:  true,
			},
			"UNO_User": {
				Title:     "user",
				Type:      "string",
				MinLength: 1,
				IsSecret:  true,
			},
		},
	}
}
