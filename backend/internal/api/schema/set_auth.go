package schema

import "fmt"

// SetAuth is the schema for incoming data validation
// Only local auth is supported for setting a password
func SetAuth() string {
	return fmt.Sprintf(`
		{
			"type": "object",
			"additionalProperties": false,
			"required": [
				"type",
				"secret"
			],
			"properties": {
				"type": {
					"type": "string",
					"pattern": "^local$"
				},
				"secret": %s,
				"current_secret": %s
			}
		}
	`, stringMinMax(8, 225), stringMinMax(8, 225))
}
