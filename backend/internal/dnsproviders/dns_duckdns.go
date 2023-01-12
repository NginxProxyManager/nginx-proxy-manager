package dnsproviders

func getDNSDuckDNS() Provider {
	return Provider{
		Title:                "dns_duckdns",
		Type:                 "object",
		AdditionalProperties: false,
		Required: []string{
			"DuckDNS_Token",
		},
		Properties: map[string]providerField{
			"DuckDNS_Token": {
				Title:     "token",
				Type:      "string",
				MinLength: 1,
				IsSecret:  true,
			},
		},
	}
}
