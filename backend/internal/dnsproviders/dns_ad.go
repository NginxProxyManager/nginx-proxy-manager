package dnsproviders

func getDNSAd() Provider {
	return Provider{
		AcmeshName: "dns_ad",
		Schema:     commonKeySchema,
		Fields: []providerField{
			{
				Name:       "API Key",
				Type:       "password",
				MetaKey:    "api_key",
				EnvKey:     "AD_API_KEY",
				IsRequired: true,
			},
		},
	}
}
