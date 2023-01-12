package dnsproviders

func getDNSGandiLiveDNS() Provider {
	return Provider{
		Title:                "dns_gandi_livedns",
		Type:                 "object",
		AdditionalProperties: false,
		Required: []string{
			"GANDI_LIVEDNS_KEY",
		},
		Properties: map[string]providerField{
			"GANDI_LIVEDNS_KEY": {
				Title:     "key",
				Type:      "string",
				MinLength: 1,
			},
		},
	}
}
