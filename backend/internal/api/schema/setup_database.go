package schema

import "fmt"

// SetupDatabase is the schema for incoming data validation.
// Fields required by postgres and mysql are checked by
// config.DBConfig.IsValid once the driver is known.
func SetupDatabase() string {
	stdField := stringMinMax(1, 255)
	return fmt.Sprintf(`
		{
			"type": "object",
			"additionalProperties": false,
			"required": [
				"driver"
			],
			"properties": {
				"driver": {
					"type": "string",
					"enum": ["sqlite", "postgres", "mysql"]
				},
				"host": %s,
				"port": {
					"type": "integer",
					"minimum": 1,
					"maximum": 65535
				},
				"username": %s,
				"password": %s,
				"name": %s,
				"sslmode": {
					"type": "string",
					"enum": ["disable", "allow", "prefer", "require", "verify-ca", "verify-full"]
				}
			}
		}
	`, stdField, stdField, stringMinMax(0, 255), stdField)
}
