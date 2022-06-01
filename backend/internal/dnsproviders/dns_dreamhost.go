package dnsproviders

func getDNSDreamhost() Provider {
	return Provider{
		AcmeshName: "dns_dreamhost",
		Schema:     commonKeySchema,
		Fields: []providerField{
			{
				Name:       "API Key",
				Type:       "password",
				MetaKey:    "api_key",
				EnvKey:     "DH_API_KEY",
				IsRequired: true,
				IsSecret:   true,
			},
		},
	}
}
