package dnsproviders

const route53Schema = `
{
	"type": "object",
	"required": [
		"access_key_id",
		"access_key"
	],
	"additionalProperties": false,
	"properties": {
		"access_key_id": {
			"type": "string",
			"minLength": 10
		},
		"access_key": {
			"type": "string",
			"minLength": 10
		},
		"slow_rate": {
			"type": "string",
			"minLength": 1
		}
	}
}
`

func getDNSAws() Provider {
	return Provider{
		AcmeshName: "dns_aws",
		Schema:     route53Schema,
		Fields: []providerField{
			{
				Name:       "Access Key ID",
				Type:       "text",
				MetaKey:    "access_key_id",
				EnvKey:     "AWS_ACCESS_KEY_ID",
				IsRequired: true,
			},
			{
				Name:       "Secret Access Key",
				Type:       "password",
				MetaKey:    "access_key",
				EnvKey:     "AWS_SECRET_ACCESS_KEY",
				IsRequired: true,
				IsSecret:   true,
			},
			{
				Name:    "Slow Rate",
				Type:    "number",
				MetaKey: "slow_rate",
				EnvKey:  "AWS_DNS_SLOWRATE",
			},
		},
	}
}
