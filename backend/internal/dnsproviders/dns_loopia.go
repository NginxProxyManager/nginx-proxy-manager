package dnsproviders

func getDNSLoopia() Provider {
	return Provider{
		Title:                "dns_loopia",
		Type:                 "object",
		AdditionalProperties: false,
		Required: []string{
			"LOOPIA_Api",
			"LOOPIA_User",
			"LOOPIA_Password",
		},
		Properties: map[string]providerField{
			"LOOPIA_Api": {
				Title:     "api-url",
				Type:      "string",
				MinLength: 4,
			},
			"LOOPIA_User": {
				Title:     "user",
				Type:      "string",
				MinLength: 1,
			},
			"LOOPIA_Password": {
				Title:     "password",
				Type:      "string",
				MinLength: 1,
				IsSecret:  true,
			},
		},
	}
}
