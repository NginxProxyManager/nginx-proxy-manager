package dnsproviders

func getDNSOne() Provider {
	return Provider{
		AcmeshName: "dns_nsone",
		Schema:     commonKeySchema,
		Fields: []providerField{
			{
				Name:       "Key",
				Type:       "password",
				MetaKey:    "api_key",
				EnvKey:     "NS1_Key",
				IsRequired: true,
				IsSecret:   true,
			},
		},
	}
}
