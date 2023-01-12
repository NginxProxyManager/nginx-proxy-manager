package dnsproviders

func getDNSInfoblox() Provider {
	return Provider{
		Title:                "dns_infoblox",
		Type:                 "object",
		AdditionalProperties: false,
		Required: []string{
			"Infoblox_Creds",
			"Infoblox_Server",
		},
		Properties: map[string]providerField{
			"Infoblox_Creds": {
				Title:     "credentials",
				Type:      "string",
				MinLength: 1,
				IsSecret:  true,
			},
			"Infoblox_Server": {
				Title:     "server",
				Type:      "string",
				MinLength: 1,
			},
		},
	}
}
