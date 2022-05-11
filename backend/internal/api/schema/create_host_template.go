package schema

// CreateHostTemplate is the schema for incoming data validation
func CreateHostTemplate() string {
	return `
		{
			"type": "object",
			"additionalProperties": false,
			"required": [
				"name",
				"host_type",
				"template"
			],
			"properties": {
				"name": {
					"type": "string",
					"minLength": 1
				},
				"host_type": {
					"type": "string",
					"pattern": "^proxy|redirect|dead|stream$"
				},
				"template": {
					"type": "string",
					"minLength": 20
				}
			}
		}
	`
}
