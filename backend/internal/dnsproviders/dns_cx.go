package dnsproviders

func getDNSCx() Provider {
	return Provider{
		Title:                "dns_cx",
		Type:                 typeObject,
		AdditionalProperties: false,
		Required: []string{
			"CX_Key",
			"CX_Secret",
		},
		Properties: map[string]providerField{
			"CX_Key": {
				Title: titleKey,
				Type:  typeString,
			},
			"CX_Secret": {
				Title:    titleSecret,
				Type:     typeString,
				IsSecret: true,
			},
		},
	}
}
