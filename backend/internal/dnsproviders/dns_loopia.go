package dnsproviders

func getDNSLoopia() Provider {
	return Provider{
		Title:                "dns_loopia",
		Type:                 typeObject,
		AdditionalProperties: false,
		Required: []string{
			"LOOPIA_Api",
			"LOOPIA_User",
			"LOOPIA_Password",
		},
		Properties: map[string]providerField{
			"LOOPIA_Api": {
				Title:     titleAPIURL,
				Type:      typeString,
				MinLength: 4,
			},
			"LOOPIA_User": {
				Title:     titleUser,
				Type:      typeString,
				MinLength: 1,
			},
			"LOOPIA_Password": {
				Title:     titlePassword,
				Type:      typeString,
				MinLength: 1,
				IsSecret:  true,
			},
		},
	}
}
