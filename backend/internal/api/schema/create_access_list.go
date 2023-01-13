package schema

import (
	"fmt"
)

// CreateAccessList is the schema for incoming data validation
func CreateAccessList() string {
	return fmt.Sprintf(`
		{
			"type": "object",
			"additionalProperties": false,
			"required": [
				"name"
			],
			"properties": {
				"name": %s
			}
		}
	`, stringMinMax(2, 100))
}
