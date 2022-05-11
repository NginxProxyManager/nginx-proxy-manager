package dnsproviders

func getDNSDynu() Provider {
	return Provider{
		AcmeshName: "dns_dynu",
		Schema:     commonKeySecretSchema,
		Fields: []providerField{
			{
				Name:       "Client ID",
				Type:       "text",
				MetaKey:    "api_key",
				EnvKey:     "Dynu_ClientId",
				IsRequired: true,
			},
			{
				Name:       "Secret",
				Type:       "password",
				MetaKey:    "secret",
				EnvKey:     "Dynu_Secret",
				IsRequired: true,
				IsSecret:   true,
			},
		},
	}
}
