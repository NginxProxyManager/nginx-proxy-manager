package dnsproviders

func getDNSUnoeuro() Provider {
	return Provider{
		Title:                "dns_unoeuro",
		Type:                 typeObject,
		AdditionalProperties: false,
		Required: []string{
			"UNO_Key",
			"UNO_User",
		},
		Properties: map[string]providerField{
			"UNO_Key": {
				Title:     titleKey,
				Type:      typeString,
				MinLength: 1,
				IsSecret:  true,
			},
			"UNO_User": {
				Title:     titleUser,
				Type:      typeString,
				MinLength: 1,
				IsSecret:  true,
			},
		},
	}
}
