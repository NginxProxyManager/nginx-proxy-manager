package schema

import "fmt"

// UpdateCertificateAuthority is the schema for incoming data validation
func UpdateCertificateAuthority() string {
	return fmt.Sprintf(`
		{
			"type": "object",
			"additionalProperties": false,
			"properties": {
				"name": %s,
				"acmesh_server": %s,
				"max_domains": %s
			}
		}
	`, stringMinMax(1, 100), stringMinMax(2, 255), intMinOne)
}
