package dnsproviders

func getDNSMe() Provider {
	return Provider{
		AcmeshName: "dns_me",
		Schema:     commonKeySecretSchema,
		Fields: []providerField{
			{
				Name:       "Key",
				Type:       "text",
				MetaKey:    "api_key",
				EnvKey:     "ME_Key",
				IsRequired: true,
			},
			{
				Name:       "Secret",
				Type:       "password",
				MetaKey:    "secret",
				EnvKey:     "ME_Secret",
				IsRequired: true,
				IsSecret:   true,
			},
		},
	}
}
