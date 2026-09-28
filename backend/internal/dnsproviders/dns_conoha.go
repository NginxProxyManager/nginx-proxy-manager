package dnsproviders

func getDNSConoha() Provider {
	return Provider{
		Title:                "dns_conoha",
		Type:                 typeObject,
		AdditionalProperties: false,
		Required: []string{
			"CONOHA_IdentityServiceApi",
			"CONOHA_Username",
			"CONOHA_Password",
			"CONOHA_TenantId",
		},
		Properties: map[string]providerField{
			"CONOHA_IdentityServiceApi": {
				Title:     titleAPIURL,
				Type:      typeString,
				MinLength: 4,
			},
			"CONOHA_Username": {
				Title:     titleUsername,
				Type:      typeString,
				MinLength: 1,
			},
			"CONOHA_Password": {
				Title:     titlePassword,
				Type:      typeString,
				MinLength: 1,
				IsSecret:  true,
			},
			"CONOHA_TenantId": {
				Title:     "tenant-id",
				Type:      typeString,
				MinLength: 1,
			},
		},
	}
}
