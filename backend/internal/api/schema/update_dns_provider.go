package schema

import "fmt"

// UpdateDNSProvider is the schema for incoming data validation
func UpdateDNSProvider() string {
	return fmt.Sprintf(`
		{
			"type": "object",
			"additionalProperties": false,
			"minProperties": 1,
			"properties": {
				"name": %s,
				"meta": {
					"type": "object"
				}
			}
		}
	`, stringMinMax(1, 100))
}
