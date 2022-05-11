package schema

import "fmt"

// SetAuth is the schema for incoming data validation
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
					"pattern": "^password$"
				},
				"secret": %s,
				"current_secret": %s
			}
		}
	`, stringMinMax(8, 225), stringMinMax(8, 225))
}
