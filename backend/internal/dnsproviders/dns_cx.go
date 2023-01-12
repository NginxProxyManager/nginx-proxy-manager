package dnsproviders

func getDNSCx() Provider {
	return Provider{
		Title:                "dns_cx",
		Type:                 "object",
		AdditionalProperties: false,
		Required: []string{
			"CX_Key",
			"CX_Secret",
		},
		Properties: map[string]providerField{
			"CX_Key": {
				Title: "key",
				Type:  "string",
			},
			"CX_Secret": {
				Title:    "secret",
				Type:     "string",
				IsSecret: true,
			},
		},
	}
}
