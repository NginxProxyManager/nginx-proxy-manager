package dnsproviders

func getDNSCyon() Provider {
	return Provider{
		Title:                "dns_cyon",
		Type:                 "object",
		AdditionalProperties: false,
		Required: []string{
			"CY_Username",
			"CY_Password",
			"CY_OTP_Secret",
		},
		Properties: map[string]providerField{
			"CY_Username": {
				Title:     "user",
				Type:      "string",
				MinLength: 1,
			},
			"CY_Password": {
				Title:     "password",
				Type:      "string",
				MinLength: 1,
				IsSecret:  true,
			},
			"CY_OTP_Secret": {
				Title:     "otp-secret",
				Type:      "string",
				MinLength: 1,
				IsSecret:  true,
			},
		},
	}
}
