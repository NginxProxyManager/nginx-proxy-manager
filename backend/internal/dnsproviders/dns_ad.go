package dnsproviders

func getDNSAd() Provider {
	return Provider{
		Title:                "dns_ad",
		Type:                 "object",
		AdditionalProperties: false,
		Required: []string{
			"AD_API_KEY",
		},
		Properties: map[string]providerField{
			"AD_API_KEY": {
				Title:     "api-key",
				Type:      "string",
				MinLength: 1,
			},
		},
	}
}
