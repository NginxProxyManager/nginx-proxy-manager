package tags

import (
	"fmt"
	"reflect"
	"regexp"
	"strings"

	"npm/internal/logger"
	"npm/internal/model"
	"npm/internal/util"

	"github.com/rotisserie/eris"
)

func GetFilterMap(m interface{}) map[string]model.FilterMapValue {
	name := getName(m)
	if val, exists := getCache(name); exists {
		return val
	}

	var filterMap = make(map[string]model.FilterMapValue)

	// If this is an entity model (and it probably is)
	// then include the base model as well
	if strings.Contains(name, ".Model") && !strings.Contains(name, "ModelBase") {
		filterMap = GetFilterMap(model.ModelBase{})
	}

	// TypeOf returns the reflection Type that represents the dynamic type of variable.
	// If variable is a nil interface value, TypeOf returns nil.
	t := reflect.TypeOf(m)

	if t.Kind() != reflect.Struct {
		logger.Error("GetFilterMapError", eris.Errorf("%v type can't have attributes inspected", t.Kind()))
		return nil
	}

	// Iterate over all available fields and read the tag value
	for i := 0; i < t.NumField(); i++ {
		// Get the field, returns https://golang.org/pkg/reflect/#StructField
		field := t.Field(i)

		// Get the field tag value
		filterTag := field.Tag.Get("filter")
		dbTag := field.Tag.Get("gorm")
		f := model.FilterMapValue{
			Model: name,
		}

		// Filter -> Schema mapping
		if filterTag != "" && filterTag != "-" {
			f.Schema = getFilterTagSchema(filterTag)
			parts := strings.Split(filterTag, ",")

			// Filter -> DB Field mapping
			if dbTag != "" && dbTag != "-" {
				// db can have many parts, we need to pull out the "column:value" part
				f.Field = field.Name
				r := regexp.MustCompile(`(?:^|;)column:([^;|$]+)(?:$|;)`)
				if matches := r.FindStringSubmatch(dbTag); len(matches) > 1 {
					f.Field = matches[1]
				}
				// Filter tag can be a 2 part thing: name,type
				// ie: account_id,integer
				// So we need to split and use the first part
				if len(parts) > 1 {
					f.Type = parts[1]
				}
			}
			filterMap[parts[0]] = f
		}
	}

	setCache(name, filterMap)
	return filterMap
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

// GetFilterSchema creates a jsonschema for validating filters, based on the model
// object given and by reading the struct "filter" tags.
func GetFilterSchema(m interface{}) string {
	filterMap := GetFilterMap(m)
	schemas := make([]string, 0)

	for _, f := range filterMap {
		schemas = append(schemas, f.Schema)
	}

	str := fmt.Sprintf(baseFilterSchema, strings.Join(schemas, ", "))
	return util.PrettyPrintJSON(str)
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
