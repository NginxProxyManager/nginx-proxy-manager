package dnsproviders

func getDNSVscale() Provider {
	return Provider{
		Title:                "dns_vscale",
		Type:                 typeObject,
		AdditionalProperties: false,
		Required: []string{
			"VSCALE_API_KEY",
		},
		Properties: map[string]providerField{
			"VSCALE_API_KEY": {
				Title:     titleAPIKey,
				Type:      typeString,
				MinLength: 1,
			},
		},
	}
}
