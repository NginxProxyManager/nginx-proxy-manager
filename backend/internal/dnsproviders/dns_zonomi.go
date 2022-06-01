package dnsproviders

func getDNSZonomi() Provider {
	return Provider{
		AcmeshName: "dns_zonomi",
		Schema:     commonKeySchema,
		Fields: []providerField{
			{
				Name:       "API Key",
				Type:       "password",
				MetaKey:    "api_key",
				EnvKey:     "ZM_Key",
				IsRequired: true,
				IsSecret:   true,
			},
		},
	}
}
