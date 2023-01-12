package dnsproviders

func getDNSConoha() Provider {
	return Provider{
		Title:                "dns_conoha",
		Type:                 "object",
		AdditionalProperties: false,
		Required: []string{
			"CONOHA_IdentityServiceApi",
			"CONOHA_Username",
			"CONOHA_Password",
			"CONOHA_TenantId",
		},
		Properties: map[string]providerField{
			"CONOHA_IdentityServiceApi": {
				Title:     "api-url",
				Type:      "string",
				MinLength: 4,
			},
			"CONOHA_Username": {
				Title:     "username",
				Type:      "string",
				MinLength: 1,
			},
			"CONOHA_Password": {
				Title:     "password",
				Type:      "string",
				MinLength: 1,
				IsSecret:  true,
			},
			"CONOHA_TenantId": {
				Title:     "tenant-id",
				Type:      "string",
				MinLength: 1,
			},
		},
	}
}
