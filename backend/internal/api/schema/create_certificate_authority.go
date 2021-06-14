package schema

import "fmt"

// CreateCertificateAuthority is the schema for incoming data validation
func CreateCertificateAuthority() string {
	return fmt.Sprintf(`
		{
			"type": "object",
			"additionalProperties": false,
			"required": [
				"name",
				"acme2_url"
			],
			"properties": {
				"name": %s,
				"acme2_url": %s
			}
		}
	`, stringMinMax(1, 100), stringMinMax(8, 255))
}
