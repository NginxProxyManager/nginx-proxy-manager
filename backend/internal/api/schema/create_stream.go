package schema

import "fmt"

// CreateStream is the schema for incoming data validation
func CreateStream() string {
	return fmt.Sprintf(`
		{
			"type": "object",
			"additionalProperties": false,
			"required": [
				"provider",
				"name",
				"domain_names"
			],
			"properties": {
				"provider": %s,
				"name": %s,
				"domain_names": %s,
				"expires_on": %s,
				"meta": {
					"type": "object"
				}
			}
		}
	`, stringMinMax(2, 100), stringMinMax(1, 100), domainNames(), intMinOne)
}
