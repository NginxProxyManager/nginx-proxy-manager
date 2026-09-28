package dnsproviders

func getDNSInfoblox() Provider {
	return Provider{
		Title:                "dns_infoblox",
		Type:                 typeObject,
		AdditionalProperties: false,
		Required: []string{
			"Infoblox_Creds",
			"Infoblox_Server",
		},
		Properties: map[string]providerField{
			"Infoblox_Creds": {
				Title:     "credentials",
				Type:      typeString,
				MinLength: 1,
				IsSecret:  true,
			},
			"Infoblox_Server": {
				Title:     "server",
				Type:      typeString,
				MinLength: 1,
			},
		},
	}
}
