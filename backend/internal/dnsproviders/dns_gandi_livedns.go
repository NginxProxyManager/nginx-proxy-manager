package dnsproviders

func getDNSGandiLiveDNS() Provider {
	return Provider{
		Title:                "dns_gandi_livedns",
		Type:                 typeObject,
		AdditionalProperties: false,
		Required: []string{
			"GANDI_LIVEDNS_KEY",
		},
		Properties: map[string]providerField{
			"GANDI_LIVEDNS_KEY": {
				Title:     titleKey,
				Type:      typeString,
				MinLength: 1,
			},
		},
	}
}
