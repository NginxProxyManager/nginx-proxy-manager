package dnsproviders

func getDNSAws() Provider {
	return Provider{
		Title:                "dns_aws",
		Type:                 typeObject,
		AdditionalProperties: false,
		Required: []string{
			"AWS_ACCESS_KEY_ID",
			"AWS_SECRET_ACCESS_KEY",
		},
		Properties: map[string]providerField{
			"AWS_ACCESS_KEY_ID": {
				Title:     "access-key-id",
				Type:      typeString,
				MinLength: 10,
			},
			"AWS_SECRET_ACCESS_KEY": {
				Title:     "secret-access-key",
				Type:      typeString,
				MinLength: 10,
				IsSecret:  true,
			},
			"AWS_DNS_SLOWRATE": {
				Title: "slow-rate",
				Type:  typeInteger,
			},
		},
	}
}
