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
				"roles",
				"is_disabled"
			],
			"properties": {
				"name": %s,
				"nickname": %s,
				"email": %s,
				"roles": %s,
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
							"pattern": "^password$"
						},
						"secret": %s
					}
				}
			}
		}
	`, stringMinMax(2, 100), stringMinMax(2, 100), stringMinMax(5, 150), userRoles(), stringMinMax(8, 255))
}
