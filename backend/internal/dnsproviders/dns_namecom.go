package dnsproviders

func getDNSNamecom() Provider {
	return Provider{
		Title:                "dns_namecom",
		Type:                 "object",
		AdditionalProperties: false,
		Required: []string{
			"Namecom_Username",
			"Namecom_Token",
		},
		Properties: map[string]providerField{
			"Namecom_Username": {
				Title:     "username",
				Type:      "string",
				MinLength: 1,
			},
			"Namecom_Token": {
				Title:     "token",
				Type:      "string",
				MinLength: 1,
				IsSecret:  true,
			},
		},
	}
}
