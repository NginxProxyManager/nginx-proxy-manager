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
				"nickname": %s,
				"email": %s,
				"is_disabled": {
					"type": "boolean"
				},
				"capabilities": %s
			}
		}
	`, stringMinMax(2, 100), stringMinMax(2, 100), stringMinMax(5, 150), capabilties())
}
