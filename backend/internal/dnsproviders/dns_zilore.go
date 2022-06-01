package dnsproviders

func getDNSDNZilore() Provider {
	return Provider{
		AcmeshName: "dns_zilore",
		Schema:     commonKeySchema,
		Fields: []providerField{
			{
				Name:       "API Key",
				Type:       "text",
				MetaKey:    "api_key",
				EnvKey:     "Zilore_Key",
				IsRequired: true,
				IsSecret:   true,
			},
		},
	}
}
