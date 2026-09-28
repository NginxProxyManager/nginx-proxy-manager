package dnsproviders

func getDNSNamecom() Provider {
	return Provider{
		Title:                "dns_namecom",
		Type:                 typeObject,
		AdditionalProperties: false,
		Required: []string{
			"Namecom_Username",
			"Namecom_Token",
		},
		Properties: map[string]providerField{
			"Namecom_Username": {
				Title:     titleUsername,
				Type:      typeString,
				MinLength: 1,
			},
			"Namecom_Token": {
				Title:     titleToken,
				Type:      typeString,
				MinLength: 1,
				IsSecret:  true,
			},
		},
	}
}
