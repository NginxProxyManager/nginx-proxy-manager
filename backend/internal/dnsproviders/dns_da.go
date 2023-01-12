package dnsproviders

func getDNSDa() Provider {
	return Provider{
		Title:                "dns_da",
		Type:                 "object",
		AdditionalProperties: false,
		Required: []string{
			"DA_Api",
		},
		Properties: map[string]providerField{
			"DA_Api": {
				Title:     "api-url",
				Type:      "string",
				MinLength: 4,
			},
			"DA_Api_Insecure": {
				Title: "insecure",
				Type:  "boolean",
			},
		},
	}
}
