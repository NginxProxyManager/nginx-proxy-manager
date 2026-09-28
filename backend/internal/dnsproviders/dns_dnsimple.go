package dnsproviders

func getDNSDNSimple() Provider {
	return Provider{
		Title:                "dns_dnsimple",
		Type:                 typeObject,
		AdditionalProperties: false,
		Required: []string{
			"DNSimple_OAUTH_TOKEN",
		},
		Properties: map[string]providerField{
			"DNSimple_OAUTH_TOKEN": {
				Title:     "oauth-token",
				Type:      typeString,
				MinLength: 1,
				IsSecret:  true,
			},
		},
	}
}
