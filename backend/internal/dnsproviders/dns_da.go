package dnsproviders

func getDNSDa() Provider {
	return Provider{
		Title:                "dns_da",
		Type:                 typeObject,
		AdditionalProperties: false,
		Required: []string{
			"DA_Api",
		},
		Properties: map[string]providerField{
			"DA_Api": {
				Title:     titleAPIURL,
				Type:      typeString,
				MinLength: 4,
			},
			"DA_Api_Insecure": {
				Title: "insecure",
				Type:  typeBoolean,
			},
		},
	}
}
