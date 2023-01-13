package dnsproviders

func getDNSPDNS() Provider {
	return Provider{
		Title:                "dns_pdns",
		Type:                 "object",
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
				Type:      "string",
				MinLength: 1,
			},
			"PDNS_ServerId": {
				Title:     "server-id",
				Type:      "string",
				MinLength: 1,
			},
			"PDNS_Token": {
				Title:     "token",
				Type:      "string",
				MinLength: 1,
			},
			"PDNS_Ttl": {
				Title:   "ttl",
				Type:    "integer",
				Minimum: 1,
			},
		},
	}
}
