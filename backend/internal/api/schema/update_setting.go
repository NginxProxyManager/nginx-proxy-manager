package schema

import "fmt"

// UpdateSetting is the schema for incoming data validation
func UpdateSetting() string {
	return fmt.Sprintf(`
		{
			"type": "object",
			"additionalProperties": false,
			"properties": {
				"value": %s
			}
		}
	`, anyType)
}
