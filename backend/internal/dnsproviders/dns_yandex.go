package dnsproviders

func getDNSYandex() Provider {
	return Provider{
		AcmeshName: "dns_yandex",
		Schema:     commonKeySchema,
		Fields: []providerField{
			{
				Name:       "Token",
				Type:       "password",
				MetaKey:    "api_key",
				EnvKey:     "PDD_Token",
				IsRequired: true,
				IsSecret:   true,
			},
		},
	}
}
