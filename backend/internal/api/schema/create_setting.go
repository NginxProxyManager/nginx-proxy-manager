package schema

import "fmt"

// CreateSetting is the schema for incoming data validation
func CreateSetting() string {
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
