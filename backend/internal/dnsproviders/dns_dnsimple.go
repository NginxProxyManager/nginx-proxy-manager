package dnsproviders

func getDNSDNSimple() Provider {
	return Provider{
		AcmeshName: "dns_dnsimple",
		Schema:     commonKeySchema,
		Fields: []providerField{
			{
				Name:       "OAuth Token",
				Type:       "text",
				MetaKey:    "api_key",
				EnvKey:     "DNSimple_OAUTH_TOKEN",
				IsRequired: true,
				IsSecret:   true,
			},
		},
	}
}
