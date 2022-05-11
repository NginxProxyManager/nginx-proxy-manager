package schema

import "fmt"

// UpdateCertificateAuthority is the schema for incoming data validation
func UpdateCertificateAuthority() string {
	return fmt.Sprintf(`
		{
			"type": "object",
			"additionalProperties": false,
			"minProperties": 1,
			"properties": {
				"name": %s,
				"acmesh_server": %s,
				"max_domains": %s,
				"ca_bundle": %s,
				"is_wildcard_supported": %s
			}
		}
	`, stringMinMax(1, 100), stringMinMax(2, 255), intMinOne, stringMinMax(2, 255), boolean)
}
