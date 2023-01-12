package dnsproviders

func getDNSDpi() Provider {
	return Provider{
		Title:                "dns_dpi",
		Type:                 "object",
		AdditionalProperties: false,
		Required: []string{
			"DPI_Id",
			"DPI_Key",
		},
		Properties: map[string]providerField{
			"DPI_Id": {
				Title:     "id",
				Type:      "string",
				MinLength: 1,
			},
			"DPI_Key": {
				Title:     "key",
				Type:      "string",
				MinLength: 1,
				IsSecret:  true,
			},
		},
	}
}
