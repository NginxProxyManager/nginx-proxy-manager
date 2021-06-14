package schema

import "fmt"

// UpdateCertificateAuthority is the schema for incoming data validation
func UpdateCertificateAuthority() string {
	return fmt.Sprintf(`
		{
			"type": "object",
			"additionalProperties": false,
			"properties": {
				"name": %s,
				"acme2_url": %s
			}
		}
	`, stringMinMax(1, 100), stringMinMax(8, 255))
}
