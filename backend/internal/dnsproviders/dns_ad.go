package dnsproviders

func getDNSAd() Provider {
	return Provider{
		Title:                "dns_ad",
		Type:                 typeObject,
		AdditionalProperties: false,
		Required: []string{
			"AD_API_KEY",
		},
		Properties: map[string]providerField{
			"AD_API_KEY": {
				Title:     titleAPIKey,
				Type:      typeString,
				MinLength: 1,
			},
		},
	}
}
