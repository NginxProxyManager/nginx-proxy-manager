package dnsproviders

func getDNSTele3() Provider {
	return Provider{
		AcmeshName: "dns_tele3",
		Schema:     commonKeySecretSchema,
		Fields: []providerField{
			{
				Name:       "Key",
				Type:       "text",
				MetaKey:    "api_key",
				EnvKey:     "TELE3_Key",
				IsRequired: true,
			},
			{
				Name:       "Secret",
				Type:       "password",
				MetaKey:    "secret",
				EnvKey:     "TELE3_Secret",
				IsRequired: true,
				IsSecret:   true,
			},
		},
	}
}
