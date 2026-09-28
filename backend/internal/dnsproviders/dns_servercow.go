package dnsproviders

func getDNSServercow() Provider {
	return Provider{
		Title:                "dns_servercow",
		Type:                 typeObject,
		AdditionalProperties: false,
		Required: []string{
			"SERVERCOW_API_Username",
			"SERVERCOW_API_Password",
		},
		Properties: map[string]providerField{
			"SERVERCOW_API_Username": {
				Title:     titleUser,
				Type:      typeString,
				MinLength: 1,
			},
			"SERVERCOW_API_Password": {
				Title:     titlePassword,
				Type:      typeString,
				MinLength: 1,
				IsSecret:  true,
			},
		},
	}
}
