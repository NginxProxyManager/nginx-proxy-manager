package dnsproviders

func getDNSDp() Provider {
	return Provider{
		Title:                "dns_dp",
		Type:                 "object",
		AdditionalProperties: false,
		Required: []string{
			"DP_Id",
			"DP_Key",
		},
		Properties: map[string]providerField{
			"DP_Id": {
				Title:     "id",
				Type:      "string",
				MinLength: 1,
			},
			"DP_Key": {
				Title:     "key",
				Type:      "string",
				MinLength: 1,
				IsSecret:  true,
			},
		},
	}
}
