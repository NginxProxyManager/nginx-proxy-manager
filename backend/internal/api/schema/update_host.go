package schema

import "fmt"

// UpdateHost is the schema for incoming data validation
func UpdateHost() string {
	return fmt.Sprintf(`
		{
			"type": "object",
			"additionalProperties": false,
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
