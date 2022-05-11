package dnsproviders

const powerDNSSchema = `
{
	"type": "object",
	"required": [
		"url",
		"server_id",
		"token",
		"ttl"
	],
	"additionalProperties": false,
	"properties": {
		"url": {
			"type": "string",
			"minLength": 1
		},
		"server_id": {
			"type": "string",
			"minLength": 1
		},
		"token": {
			"type": "string",
			"minLength": 1
		},
		"ttl": {
			"type": "string",
			"minLength": 1
		}
	}
}
`

func getDNSPDNS() Provider {
	return Provider{
		AcmeshName: "dns_pdns",
		Schema:     powerDNSSchema,
		Fields: []providerField{
			{
				Name:       "URL",
				Type:       "text",
				MetaKey:    "url",
				EnvKey:     "PDNS_Url",
				IsRequired: true,
			},
			{
				Name:       "Server ID",
				Type:       "text",
				MetaKey:    "server_id",
				EnvKey:     "PDNS_ServerId",
				IsRequired: true,
			},
			{
				Name:       "Token",
				Type:       "text",
				MetaKey:    "token",
				EnvKey:     "PDNS_Token",
				IsRequired: true,
			},
			{
				Name:       "TTL",
				Type:       "number",
				MetaKey:    "ttl",
				EnvKey:     "PDNS_Ttl",
				IsRequired: true,
			},
		},
	}
}
