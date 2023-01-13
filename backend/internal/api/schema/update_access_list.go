package schema

import "fmt"

// UpdateAccessList is the schema for incoming data validation
func UpdateAccessList() string {
	return fmt.Sprintf(`
		{
			"type": "object",
			"additionalProperties": false,
			"minProperties": 1,
			"properties": {
				"name": %s
			}
		}
	`, stringMinMax(2, 100))
}
