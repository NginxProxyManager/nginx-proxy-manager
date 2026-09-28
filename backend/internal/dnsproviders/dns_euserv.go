package dnsproviders

func getDNSEuserv() Provider {
	return Provider{
		Title:                "dns_euserv",
		Type:                 typeObject,
		AdditionalProperties: false,
		Required: []string{
			"EUSERV_Username",
			"EUSERV_Password",
		},
		Properties: map[string]providerField{
			"EUSERV_Username": {
				Title:     titleUser,
				Type:      typeString,
				MinLength: 1,
			},
			"EUSERV_Password": {
				Title:     titlePassword,
				Type:      typeString,
				MinLength: 1,
				IsSecret:  true,
			},
		},
	}
}
