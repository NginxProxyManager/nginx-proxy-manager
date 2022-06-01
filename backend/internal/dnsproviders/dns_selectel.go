package dnsproviders

func getDNSSelectel() Provider {
	return Provider{
		AcmeshName: "dns_selectel",
		Schema:     commonKeySchema,
		Fields: []providerField{
			{
				Name:       "API Key",
				Type:       "password",
				MetaKey:    "api_key",
				EnvKey:     "SL_Key",
				IsRequired: true,
				IsSecret:   true,
			},
		},
	}
}
