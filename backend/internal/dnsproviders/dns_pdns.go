package dnsproviders

func getDNSPDNS() Provider {
	return Provider{
		Title:                "dns_pdns",
		Type:                 typeObject,
		AdditionalProperties: false,
		Required: []string{
			"PDNS_Url",
			"PDNS_ServerId",
			"PDNS_Token",
			"PDNS_Ttl",
		},
		Properties: map[string]providerField{
			"PDNS_Url": {
				Title:     "url",
				Type:      typeString,
				MinLength: 1,
			},
			"PDNS_ServerId": {
				Title:     "server-id",
				Type:      typeString,
				MinLength: 1,
			},
			"PDNS_Token": {
				Title:     titleToken,
				Type:      typeString,
				MinLength: 1,
			},
			"PDNS_Ttl": {
				Title:   "ttl",
				Type:    typeInteger,
				Minimum: 1,
			},
		},
	}
}
