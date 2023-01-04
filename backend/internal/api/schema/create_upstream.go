package schema

import "fmt"

// CreateUpstream is the schema for incoming data validation
func CreateUpstream() string {
	return fmt.Sprintf(`
	{
		"type": "object",
		"additionalProperties": false,
		"required": [
			"name",
			"servers",
			"nginx_template_id"
		],
		"properties": {
			"name": %s,
			"nginx_template_id": {
				"type": "integer",
				"minimum": 1
			},
			"advanced_config": %s,
			"ip_hash": {
				"type": "boolean"
			},
			"ntlm": {
				"type": "boolean"
			},
			"keepalive": {
				"type": "integer"
			},
			"keepalive_requests": {
				"type": "integer"
			},
			"keepalive_time": {
				"type": "string"
			},
			"keepalive_timeout": {
				"type": "string"
			},
			"servers": {
				"type": "array",
				"minItems": 1,
				"items": {
					"type": "object",
					"additionalProperties": false,
					"required": [
						"server"
					],
					"properties": {
						"server": %s,
						"weight": {
							"type": "integer"
						},
						"max_conns": {
							"type": "integer"
						},
						"max_fails": {
							"type": "integer"
						},
						"fail_timeout": {
							"type": "integer"
						},
						"backup": {
							"type": "boolean"
						}
					}
				}
			}
		}
	}
`, stringMinMax(1, 100), stringMinMax(0, 1024), stringMinMax(2, 255))
}
