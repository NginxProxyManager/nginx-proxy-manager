package dnsproviders

// Note: https://github.com/acmesh-official/acme.sh/wiki/dnsapi#14-use-linode-domain-api
// needs 15 minute sleep, not currently implemented
func getDNSLinodeV4() Provider {
	return Provider{
		AcmeshName: "dns_linode_v4",
		Schema:     commonKeySchema,
		Fields: []providerField{
			{
				Name:       "API Key",
				Type:       "text",
				MetaKey:    "api_key",
				EnvKey:     "LINODE_V4_API_KEY",
				IsRequired: true,
				IsSecret:   true,
			},
		},
	}
}
