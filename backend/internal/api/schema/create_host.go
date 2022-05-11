package schema

import "fmt"

// CreateHost is the schema for incoming data validation
// This schema supports 3 possible types with different data combinations:
// - proxy
// - redirection
// - dead
func CreateHost() string {
	return fmt.Sprintf(`
		{
			"oneOf": [
				{
					"type": "object",
					"additionalProperties": false,
					"required": [
						"type",
						"domain_names",
						"host_template_id"
					],
					"properties": {
						"type": {
							"type": "string",
							"pattern": "^proxy$"
						},
						"host_template_id": {
							"type": "integer",
							"minimum": 1
						},
						"listen_interface": %s,
						"domain_names": %s,
						"upstream_id": {
							"type": "integer"
						},
						"certificate_id": {
							"type": "integer"
						},
						"access_list_id": {
							"type": "integer"
						},
						"ssl_forced": {
							"type": "boolean"
						},
						"caching_enabled": {
							"type": "boolean"
						},
						"block_exploits": {
							"type": "boolean"
						},
						"allow_websocket_upgrade": {
							"type": "boolean"
						},
						"http2_support": {
							"type": "boolean"
						},
						"hsts_enabled": {
							"type": "boolean"
						},
						"hsts_subdomains": {
							"type": "boolean"
						},
						"paths": {
							"type": "string"
						},
						"upstream_options": {
							"type": "string"
						},
						"advanced_config": {
							"type": "string"
						},
						"is_disabled": {
							"type": "boolean"
						}
					}
				}
			]
		}
	`, stringMinMax(0, 255), domainNames())
}
