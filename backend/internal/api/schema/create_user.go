package schema

import "fmt"

// CreateUser is the schema for incoming data validation
func CreateUser() string {
	return fmt.Sprintf(`
		{
			"type": "object",
			"additionalProperties": false,
			"required": [
				"name",
				"email",
				"is_disabled",
				"capabilities"
			],
			"properties": {
				"name": %s,
				"email": %s,
				"is_disabled": {
					"type": "boolean"
				},
				"auth": {
					"type": "object",
					"required": [
						"type",
						"secret"
					],
					"properties": {
						"type": {
							"type": "string",
							"pattern": "^local$"
						},
						"secret": %s
					}
				},
				"capabilities": %s
			}
		}
	`, stringMinMax(2, 50), stringMinMax(5, 150), stringMinMax(8, 255), capabilties())
}
