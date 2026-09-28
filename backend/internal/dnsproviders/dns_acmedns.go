package dnsproviders

func getDNSAcmeDNS() Provider {
	return Provider{
		Title:                "dns_acmedns",
		Type:                 typeObject,
		AdditionalProperties: false,
		Required: []string{
			"ACMEDNS_BASE_URL",
			"ACMEDNS_SUBDOMAIN",
			"ACMEDNS_USERNAME",
			"ACMEDNS_PASSWORD",
		},
		Properties: map[string]providerField{
			"ACMEDNS_BASE_URL": {
				Title: "base-url",
				Type:  typeString,
			},
			"ACMEDNS_SUBDOMAIN": {
				Title: "subdomain",
				Type:  typeString,
			},
			"ACMEDNS_USERNAME": {
				Title: titleUsername,
				Type:  typeString,
			},
			"ACMEDNS_PASSWORD": {
				Title:    titlePassword,
				Type:     typeString,
				IsSecret: true,
			},
		},
	}
}
