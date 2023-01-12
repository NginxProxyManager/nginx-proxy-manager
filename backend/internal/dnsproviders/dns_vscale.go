package dnsproviders

func getDNSVscale() Provider {
	return Provider{
		Title:                "dns_vscale",
		AdditionalProperties: false,
		Required: []string{
			"VSCALE_API_KEY",
		},
		Properties: map[string]providerField{
			"VSCALE_API_KEY": {
				Title:     "api-key",
				Type:      "string",
				MinLength: 1,
			},
		},
	}
}
