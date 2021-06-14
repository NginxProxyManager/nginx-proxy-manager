package schema

import "fmt"

// SetAuth is the schema for incoming data validation
func SetAuth() string {
	return fmt.Sprintf(`
		{
			"type": "object",
			"additionalProperties": false,
			"required": [
				"name",
				"value"
			],
			"properties": {
				"name": %s,
				"value": %s
			}
		}
	`, stringMinMax(2, 100), anyType)
}
