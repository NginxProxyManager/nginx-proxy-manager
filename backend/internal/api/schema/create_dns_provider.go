package schema

import "fmt"

// CreateDNSProvider is the schema for incoming data validation
func CreateDNSProvider() string {
	return fmt.Sprintf(`
		{
			"type": "object",
			"additionalProperties": false,
			"required": [
				"name",
				"acme_sh_name",
				"meta"
			],
			"properties": {
				"name": %s,
				"acme_sh_name": %s,
				"meta": {
					"type": "object"
				}
			}
		}
	`, stringMinMax(1, 100), stringMinMax(4, 50))
}
