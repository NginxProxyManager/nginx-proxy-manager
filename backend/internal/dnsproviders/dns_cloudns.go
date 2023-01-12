package dnsproviders

func getDNSCloudns() Provider {
	return Provider{
		Title:                "dns_cloudns",
		Type:                 "object",
		AdditionalProperties: false,
		Required: []string{
			"CLOUDNS_AUTH_ID",
			"CLOUDNS_SUB_AUTH_ID",
			"CLOUDNS_AUTH_PASSWORD",
		},
		Properties: map[string]providerField{
			"CLOUDNS_AUTH_ID": {
				Title:     "auth-id",
				Type:      "string",
				MinLength: 1,
			},
			"CLOUDNS_SUB_AUTH_ID": {
				Title:     "sub-auth-id",
				Type:      "string",
				MinLength: 1,
			},
			"CLOUDNS_AUTH_PASSWORD": {
				Title:     "password",
				Type:      "string",
				MinLength: 1,
				IsSecret:  true,
			},
		},
	}
}
