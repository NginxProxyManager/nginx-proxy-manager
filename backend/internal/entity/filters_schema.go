package entity

import (
	"fmt"
	"npm/internal/logger"
	"npm/internal/util"
	"reflect"
	"strings"

	"github.com/rotisserie/eris"
)

// GetFilterSchema creates a jsonschema for validating filters, based on the model
// object given and by reading the struct "filter" tags.
func GetFilterSchema(m interface{}, includeBaseEntity bool) string {
	var schemas []string
	t := reflect.TypeOf(m)

	if t.Kind() != reflect.Struct {
		logger.Error("GetFilterSchemaError", eris.Errorf("%v type can't have attributes inspected", t.Kind()))
		return ""
	}

	// The base entity model
	if includeBaseEntity {
		b := reflect.TypeOf(ModelBase{})
		for i := 0; i < b.NumField(); i++ {
			bField := b.Field(i)
			bFilterTag := bField.Tag.Get("filter")
			if bFilterTag != "" && bFilterTag != "-" {
				schemas = append(schemas, getFilterTagSchema(bFilterTag))
			}
		}
	}

	// The actual interface
	for i := 0; i < t.NumField(); i++ {
		field := t.Field(i)
		filterTag := field.Tag.Get("filter")

		if filterTag != "" && filterTag != "-" {
			schemas = append(schemas, getFilterTagSchema(filterTag))
		}
	}

	return util.PrettyPrintJSON(newFilterSchema(schemas))
}

func getFilterTagSchema(filterTag string) string {
	// split out tag value "field,filtreType"
	// with a default filter type of string
	items := strings.Split(filterTag, ",")
	if len(items) == 1 {
		items = append(items, "string")
	}

	switch items[1] {
	case "number":
		fallthrough
	case "int":
		fallthrough
	case "integer":
		return intFieldSchema(items[0])
	case "bool":
		fallthrough
	case "boolean":
		return boolFieldSchema(items[0])
	case "date":
		return dateFieldSchema(items[0])
	case "regex":
		if len(items) < 3 {
			items = append(items, ".*")
		}
		return regexFieldSchema(items[0], items[2])

	default:
		return stringFieldSchema(items[0])
	}
}

// newFilterSchema is the main method to specify a new Filter Schema for use in Middleware
func newFilterSchema(fieldSchemas []string) string {
	return fmt.Sprintf(baseFilterSchema, strings.Join(fieldSchemas, ", "))
}

// boolFieldSchema returns the Field Schema for a Boolean accepted value field
func boolFieldSchema(fieldName string) string {
	return fmt.Sprintf(`{
		"type": "object",
		"properties": {
			"field": {
				"type": "string",
				"pattern": "^%s$"
			},
			"modifier": %s,
			"value": {
				"oneOf": [
					%s,
					{
						"type": "array",
						"items": %s
					}
				]
			}
		}
	}`, fieldName, boolModifiers, filterBool, filterBool)
}

// intFieldSchema returns the Field Schema for a Integer accepted value field
func intFieldSchema(fieldName string) string {
	return fmt.Sprintf(`{
		"type": "object",
		"properties": {
			"field": {
				"type": "string",
				"pattern": "^%s$"
			},
			"modifier": %s,
			"value": {
				"oneOf": [
					{
						"type": "string",
						"pattern": "^[0-9]+$"
					},
					{
						"type": "array",
						"items": {
							"type": "string",
							"pattern": "^[0-9]+$"
						}
					}
				]
			}
		}
	}`, fieldName, allModifiers)
}

// stringFieldSchema returns the Field Schema for a String accepted value field
func stringFieldSchema(fieldName string) string {
	return fmt.Sprintf(`{
		"type": "object",
		"properties": {
			"field": {
				"type": "string",
				"pattern": "^%s$"
			},
			"modifier": %s,
			"value": {
				"oneOf": [
					%s,
					{
						"type": "array",
						"items": %s
					}
				]
			}
		}
	}`, fieldName, stringModifiers, filterString, filterString)
}

// regexFieldSchema  returns the Field Schema for a String accepted value field matching a Regex
func regexFieldSchema(fieldName string, regex string) string {
	return fmt.Sprintf(`{
		"type": "object",
		"properties": {
			"field": {
				"type": "string",
				"pattern": "^%s$"
			},
			"modifier": %s,
			"value": {
				"oneOf": [
					{
						"type": "string",
						"pattern": "%s"
					},
					{
						"type": "array",
						"items": {
							"type": "string",
							"pattern": "%s"
						}
					}
				]
			}
		}
	}`, fieldName, stringModifiers, regex, regex)
}

// dateFieldSchema returns the Field Schema for a String accepted value field matching a Date format
func dateFieldSchema(fieldName string) string {
	return fmt.Sprintf(`{
		"type": "object",
		"properties": {
			"field": {
				"type": "string",
				"pattern": "^%s$"
			},
			"modifier": %s,
			"value": {
				"oneOf": [
					{
						"type": "string",
						"pattern": "^([12]\\d{3}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01]))$"
					},
					{
						"type": "array",
						"items": {
							"type": "string",
							"pattern": "^([12]\\d{3}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01]))$"
						}
					}
				]
			}
		}
	}`, fieldName, allModifiers)
}

const allModifiers = `{
	"type": "string",
	"pattern": "^(equals|not|contains|starts|ends|in|notin|min|max|greater|less)$"
}`

const boolModifiers = `{
	"type": "string",
	"pattern": "^(equals|not)$"
}`

const stringModifiers = `{
	"type": "string",
	"pattern": "^(equals|not|contains|starts|ends|in|notin)$"
}`

const filterBool = `{
	"type": "string",
	"pattern": "^(TRUE|true|t|yes|y|on|1|FALSE|f|false|n|no|off|0)$"
}`

const filterString = `{
	"type": "string",
	"minLength": 1
}`

const baseFilterSchema = `{
	"type": "array",
	"items": {
		"oneOf": [
			%s
		]
	}
}`
