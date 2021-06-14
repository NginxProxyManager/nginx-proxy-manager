package schema

import "fmt"

// GetToken is the schema for incoming data validation
// nolint: gosec
func GetToken() string {
	stdField := stringMinMax(1, 255)
	return fmt.Sprintf(`
		{
			"type": "object",
			"additionalProperties": false,
			"required": [
				"type",
				"identity",
				"secret"
			],
			"properties": {
				"type": {
					"type": "string",
					"pattern": "^password$"
				},
				"identity": %s,
				"secret": %s
			}
		}
	`, stdField, stdField)
}
