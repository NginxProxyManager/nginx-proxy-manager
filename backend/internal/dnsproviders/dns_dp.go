package dnsproviders

func getDNSDp() Provider {
	return Provider{
		Title:                "dns_dp",
		Type:                 typeObject,
		AdditionalProperties: false,
		Required: []string{
			"DP_Id",
			"DP_Key",
		},
		Properties: map[string]providerField{
			"DP_Id": {
				Title:     "id",
				Type:      typeString,
				MinLength: 1,
			},
			"DP_Key": {
				Title:     titleKey,
				Type:      typeString,
				MinLength: 1,
				IsSecret:  true,
			},
		},
	}
}
