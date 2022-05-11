package dnsproviders

func getDNSDgon() Provider {
	return Provider{
		AcmeshName: "dns_dgon",
		Schema:     commonKeySchema,
		Fields: []providerField{
			{
				Name:       "API Key",
				Type:       "password",
				MetaKey:    "api_key",
				EnvKey:     "DO_API_KEY",
				IsRequired: true,
				IsSecret:   true,
			},
		},
	}
}
