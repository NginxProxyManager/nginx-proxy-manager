package dnsproviders

func getDNSNamesilo() Provider {
	return Provider{
		AcmeshName: "dns_namesilo",
		Schema:     commonKeySchema,
		Fields: []providerField{
			{
				Name:       "API Key",
				Type:       "password",
				MetaKey:    "api_key",
				EnvKey:     "Namesilo_Key",
				IsRequired: true,
				IsSecret:   true,
			},
		},
	}
}
