package dnsproviders

func getDNSGd() Provider {
	return Provider{
		AcmeshName: "dns_gd",
		Schema:     commonKeySecretSchema,
		Fields: []providerField{
			{
				Name:       "Key",
				Type:       "text",
				MetaKey:    "api_key",
				EnvKey:     "GD_Key",
				IsRequired: true,
			},
			{
				Name:       "Secret",
				Type:       "password",
				MetaKey:    "secret",
				EnvKey:     "GD_Secret",
				IsRequired: true,
				IsSecret:   true,
			},
		},
	}
}
