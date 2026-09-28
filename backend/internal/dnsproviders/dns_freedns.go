package dnsproviders

func getDNSFreeDNS() Provider {
	return Provider{
		Title:                "dns_freedns",
		Type:                 typeObject,
		AdditionalProperties: false,
		Required: []string{
			"FREEDNS_User",
			"FREEDNS_Password",
		},
		Properties: map[string]providerField{
			"FREEDNS_User": {
				Title:     titleUser,
				Type:      typeString,
				MinLength: 1,
			},
			"FREEDNS_Password": {
				Title:     titlePassword,
				Type:      typeString,
				MinLength: 1,
				IsSecret:  true,
			},
		},
	}
}
