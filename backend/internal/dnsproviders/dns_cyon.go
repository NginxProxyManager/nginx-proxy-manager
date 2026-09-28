package dnsproviders

func getDNSCyon() Provider {
	return Provider{
		Title:                "dns_cyon",
		Type:                 typeObject,
		AdditionalProperties: false,
		Required: []string{
			"CY_Username",
			"CY_Password",
			"CY_OTP_Secret",
		},
		Properties: map[string]providerField{
			"CY_Username": {
				Title:     titleUser,
				Type:      typeString,
				MinLength: 1,
			},
			"CY_Password": {
				Title:     titlePassword,
				Type:      typeString,
				MinLength: 1,
				IsSecret:  true,
			},
			"CY_OTP_Secret": {
				Title:     "otp-secret",
				Type:      typeString,
				MinLength: 1,
				IsSecret:  true,
			},
		},
	}
}
