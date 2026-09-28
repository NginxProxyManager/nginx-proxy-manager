package dnsproviders

func getDNSDuckDNS() Provider {
	return Provider{
		Title:                "dns_duckdns",
		Type:                 typeObject,
		AdditionalProperties: false,
		Required: []string{
			"DuckDNS_Token",
		},
		Properties: map[string]providerField{
			"DuckDNS_Token": {
				Title:     titleToken,
				Type:      typeString,
				MinLength: 1,
				IsSecret:  true,
			},
		},
	}
}
