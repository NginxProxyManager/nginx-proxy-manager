package dnsproviders

func getDNSCf() Provider {
	return Provider{
		Title:                "dns_cf",
		Type:                 "object",
		AdditionalProperties: false,
		Required: []string{
			"CF_Key",
			"CF_Email",
			"CF_Token",
			"CF_Account_ID",
		},
		Properties: map[string]providerField{
			"CF_Key": {
				Title:     "api-key",
				Type:      "string",
				MinLength: 1,
			},
			"CF_Email": {
				Title:     "email",
				Type:      "string",
				MinLength: 5,
			},
			"CF_Token": {
				Title:     "token",
				Type:      "string",
				MinLength: 5,
				IsSecret:  true,
			},
			"CF_Account_ID": {
				Title:     "account-id",
				Type:      "string",
				MinLength: 1,
			},
			"CF_Zone_ID": {
				Title:     "zone-id",
				Type:      "string",
				MinLength: 1,
			},
		},
	}
}
