package dnsproviders

func getDNSKinghost() Provider {
	return Provider{
		Title:                "dns_kinghost",
		Type:                 typeObject,
		AdditionalProperties: false,
		Required: []string{
			"KINGHOST_Username",
			"KINGHOST_Password",
		},
		Properties: map[string]providerField{
			"KINGHOST_Username": {
				Title:     titleUser,
				Type:      typeString,
				MinLength: 1,
			},
			"KINGHOST_Password": {
				Title:     titlePassword,
				Type:      typeString,
				MinLength: 1,
				IsSecret:  true,
			},
		},
	}
}
