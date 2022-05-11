package dnsproviders

func getDNSCx() Provider {
	return Provider{
		AcmeshName: "dns_cx",
		Schema:     commonKeySecretSchema,
		Fields: []providerField{
			{
				Name:       "Key",
				Type:       "text",
				MetaKey:    "api_key",
				EnvKey:     "CX_Key",
				IsRequired: true,
			},
			{
				Name:       "Secret",
				Type:       "password",
				MetaKey:    "secret",
				EnvKey:     "CX_Secret",
				IsRequired: true,
				IsSecret:   true,
			},
		},
	}
}
