package dnsproviders

func getDNSAcmeDNS() Provider {
	return Provider{
		Title:                "dns_acmedns",
		Type:                 "object",
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
				Type:  "string",
			},
			"ACMEDNS_SUBDOMAIN": {
				Title: "subdomain",
				Type:  "string",
			},
			"ACMEDNS_USERNAME": {
				Title: "username",
				Type:  "string",
			},
			"ACMEDNS_PASSWORD": {
				Title:    "password",
				Type:     "string",
				IsSecret: true,
			},
		},
	}
}
