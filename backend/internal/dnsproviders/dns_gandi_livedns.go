package dnsproviders

func getDNSGandiLiveDNS() Provider {
	return Provider{
		AcmeshName: "dns_gandi_livedns",
		Schema:     commonKeySchema,
		Fields: []providerField{
			{
				Name:       "Key",
				Type:       "password",
				MetaKey:    "api_key",
				EnvKey:     "GANDI_LIVEDNS_KEY",
				IsRequired: true,
			},
		},
	}
}
