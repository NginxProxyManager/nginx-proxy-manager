package schema

// CreateNginxTemplate is the schema for incoming data validation
func CreateNginxTemplate() string {
	return `
		{
			"type": "object",
			"additionalProperties": false,
			"required": [
				"name",
				"type",
				"template"
			],
			"properties": {
				"name": {
					"type": "string",
					"minLength": 1
				},
				"type": {
					"type": "string",
					"pattern": "^proxy|redirect|dead|stream|upstream$"
				},
				"template": {
					"type": "string",
					"minLength": 20
				}
			}
		}
	`
}
