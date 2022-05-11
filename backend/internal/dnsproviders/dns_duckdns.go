package dnsproviders

func getDNSDuckDNS() Provider {
	return Provider{
		AcmeshName: "dns_duckdns",
		Schema:     commonKeySchema,
		Fields: []providerField{
			{
				Name:       "Token",
				Type:       "password",
				MetaKey:    "api_key",
				EnvKey:     "DuckDNS_Token",
				IsRequired: true,
				IsSecret:   true,
			},
		},
	}
}
