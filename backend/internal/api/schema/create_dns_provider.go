package schema

import (
	"fmt"
	"strings"

	"npm/internal/dnsproviders"
	"npm/internal/logger"
	"npm/internal/util"
)

// CreateDNSProvider is the schema for incoming data validation
func CreateDNSProvider() string {
	allProviders := dnsproviders.GetAll()
	fmtStr := fmt.Sprintf(`{"oneOf": [%s]}`, strings.TrimRight(strings.Repeat("\n%s,", len(allProviders)), ","))

	allSchemasWrapped := make([]string, 0)
	for providerName, provider := range allProviders {
		schema, err := provider.GetJsonSchema()
		if err != nil {
			logger.Error("ProviderSchemaError", fmt.Errorf("Invalid Provider Schema for %s: %v", provider.Title, err))
		} else {
			allSchemasWrapped = append(allSchemasWrapped, createDNSProviderType(providerName, schema))
		}
	}

	return fmt.Sprintf(fmtStr, util.ConvertStringSliceToInterface(allSchemasWrapped)...)
}

func createDNSProviderType(name, metaSchema string) string {
	return fmt.Sprintf(`
		{
			"type": "object",
			"additionalProperties": false,
			"required": [
				"acmesh_name",
				"name",
				"meta"
			],
			"properties": {
				"acmesh_name": {
					"type": "string",
					"pattern": "^%s$"
				},
				"name": {
					"type": "string",
					"minLength": 1,
					"maxLength": 100
				},
				"dns_sleep": {
					"type": "integer"
				},
				"meta": %s
			}
		}
	`, name, metaSchema)
}
