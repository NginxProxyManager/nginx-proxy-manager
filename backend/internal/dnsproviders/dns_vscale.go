package dnsproviders

func getDNSVscale() Provider {
	return Provider{
		AcmeshName: "dns_vscale",
		Schema:     commonKeySchema,
		Fields: []providerField{
			{
				Name:       "API Key",
				Type:       "password",
				MetaKey:    "api_key",
				EnvKey:     "VSCALE_API_KEY",
				IsRequired: true,
			},
		},
	}
}
