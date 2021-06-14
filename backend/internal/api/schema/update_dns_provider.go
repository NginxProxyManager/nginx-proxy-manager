package schema

import "fmt"

// UpdateDNSProvider is the schema for incoming data validation
func UpdateDNSProvider() string {
	return fmt.Sprintf(`
		{
			"type": "object",
			"additionalProperties": false,
			"properties": {
				"name": %s,
				"meta": {
					"type": "object"
				}
			}
		}
	`, stringMinMax(1, 100))
}
