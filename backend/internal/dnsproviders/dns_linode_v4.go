package dnsproviders

// Note: https://github.com/acmesh-official/acme.sh/wiki/dnsapi#14-use-linode-domain-api
// needs 15 minute sleep, not currently implemented
func getDNSLinodeV4() Provider {
	return Provider{
		Title:                "dns_linode_v4",
		Type:                 "object",
		AdditionalProperties: false,
		Required: []string{
			"LINODE_V4_API_KEY",
		},
		Properties: map[string]providerField{
			"LINODE_V4_API_KEY": {
				Title:     "api-key",
				Type:      "string",
				MinLength: 1,
				IsSecret:  true,
			},
		},
	}
}
