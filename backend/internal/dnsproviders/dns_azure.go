package dnsproviders

func getDNSAzure() Provider {
	return Provider{
		Title:                "dns_azure",
		Type:                 typeObject,
		AdditionalProperties: false,
		Required: []string{
			"AZUREDNS_SUBSCRIPTIONID",
			"AZUREDNS_TENANTID",
			"AZUREDNS_APPID",
			"AZUREDNS_CLIENTSECRET",
		},
		Properties: map[string]providerField{
			"AZUREDNS_SUBSCRIPTIONID": {
				Title:     "subscription-id",
				Type:      typeString,
				MinLength: 1,
			},
			"AZUREDNS_TENANTID": {
				Title:     "tenant-id",
				Type:      typeString,
				MinLength: 1,
			},
			"AZUREDNS_APPID": {
				Title:     "app-id",
				Type:      typeString,
				MinLength: 1,
			},
			"AZUREDNS_CLIENTSECRET": {
				Title:     "client-secret",
				Type:      typeString,
				MinLength: 1,
				IsSecret:  true,
			},
		},
	}
}
