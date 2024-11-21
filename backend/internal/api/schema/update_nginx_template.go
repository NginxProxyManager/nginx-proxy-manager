package schema

// UpdateNginxTemplate is the schema for incoming data validation
func UpdateNginxTemplate() string {
	return `
		{
			"type": "object",
			"additionalProperties": false,
			"minProperties": 1,
			"properties": {
				"name": {
					"type": "string",
					"minLength": 1
				},
				"template": {
					"type": "string",
					"minLength": 20
				}
			}
		}
	`
}
