package dnsproviders

func getDNSAli() Provider {
	return Provider{
		AcmeshName: "dns_ali",
		Schema:     commonKeySecretSchema,
		Fields: []providerField{
			{
				Name:       "Key",
				Type:       "text",
				MetaKey:    "api_key",
				EnvKey:     "Ali_Key",
				IsRequired: true,
			},
			{
				Name:       "Secret",
				Type:       "password",
				MetaKey:    "secret",
				EnvKey:     "Ali_Secret",
				IsRequired: true,
				IsSecret:   true,
			},
		},
	}
}
