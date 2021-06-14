package schema

import "fmt"

// CreateDNSProvider is the schema for incoming data validation
func CreateDNSProvider() string {
	return fmt.Sprintf(`
		{
			"type": "object",
			"additionalProperties": false,
			"required": [
				"provider_key",
				"name",
				"meta"
			],
			"properties": {
				"provider_key": %s,
				"name": %s,
				"meta": {
					"type": "object"
				}
			}
		}
	`, stringMinMax(2, 100), stringMinMax(1, 100))
}
