package dnsproviders

func getDNSDpi() Provider {
	return Provider{
		Title:                "dns_dpi",
		Type:                 typeObject,
		AdditionalProperties: false,
		Required: []string{
			"DPI_Id",
			"DPI_Key",
		},
		Properties: map[string]providerField{
			"DPI_Id": {
				Title:     "id",
				Type:      typeString,
				MinLength: 1,
			},
			"DPI_Key": {
				Title:     titleKey,
				Type:      typeString,
				MinLength: 1,
				IsSecret:  true,
			},
		},
	}
}
