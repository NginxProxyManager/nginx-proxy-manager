package schema

import "fmt"

// UpdateUser is the schema for incoming data validation
func UpdateUser() string {
	return fmt.Sprintf(`
		{
			"type": "object",
			"additionalProperties": false,
			"minProperties": 1,
			"properties": {
				"name": %s,
				"email": %s,
				"is_disabled": {
					"type": "boolean"
				},
				"capabilities": %s
			}
		}
	`, stringMinMax(2, 50), stringMinMax(5, 150), capabilties())
}
