package dnsproviders

func getDNSIspconfig() Provider {
	return Provider{
		Title:                "dns_ispconfig",
		Type:                 typeObject,
		AdditionalProperties: false,
		Required: []string{
			"ISPC_User",
			"ISPC_Password",
			"ISPC_Api",
		},
		Properties: map[string]providerField{
			"ISPC_User": {
				Title:     titleUser,
				Type:      typeString,
				MinLength: 1,
			},
			"ISPC_Password": {
				Title:     titlePassword,
				Type:      typeString,
				MinLength: 1,
				IsSecret:  true,
			},
			"ISPC_Api": {
				Title:     titleAPIURL,
				Type:      typeString,
				MinLength: 1,
			},
			"ISPC_Api_Insecure": {
				Title: "insecure",
				Type:  typeBoolean,
			},
		},
	}
}
