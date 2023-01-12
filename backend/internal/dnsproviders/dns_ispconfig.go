package dnsproviders

func getDNSIspconfig() Provider {
	return Provider{
		Title:                "dns_ispconfig",
		Type:                 "object",
		AdditionalProperties: false,
		Required: []string{
			"ISPC_User",
			"ISPC_Password",
			"ISPC_Api",
		},
		Properties: map[string]providerField{
			"ISPC_User": {
				Title:     "user",
				Type:      "string",
				MinLength: 1,
			},
			"ISPC_Password": {
				Title:     "password",
				Type:      "string",
				MinLength: 1,
				IsSecret:  true,
			},
			"ISPC_Api": {
				Title:     "api-url",
				Type:      "string",
				MinLength: 1,
			},
			"ISPC_Api_Insecure": {
				Title: "insecure",
				Type:  "boolean",
			},
		},
	}
}
