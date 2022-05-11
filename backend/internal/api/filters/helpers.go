package filters

import (
	"fmt"
	"strings"
)

// NewFilterSchema is the main method to specify a new Filter Schema for use in Middleware
func NewFilterSchema(fieldSchemas []string) string {
	return fmt.Sprintf(baseFilterSchema, strings.Join(fieldSchemas, ", "))
}

// BoolFieldSchema returns the Field Schema for a Boolean accepted value field
func BoolFieldSchema(fieldName string) string {
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

// IntFieldSchema returns the Field Schema for a Integer accepted value field
func IntFieldSchema(fieldName string) string {
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

// StringFieldSchema returns the Field Schema for a String accepted value field
func StringFieldSchema(fieldName string) string {
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

// RegexFieldSchema  returns the Field Schema for a String accepted value field matching a Regex
func RegexFieldSchema(fieldName string, regex string) string {
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

// DateFieldSchema returns the Field Schema for a String accepted value field matching a Date format
func DateFieldSchema(fieldName string) string {
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

// DateTimeFieldSchema returns the Field Schema for a String accepted value field matching a Date format
// 2020-03-01T10:30:00+10:00
func DateTimeFieldSchema(fieldName string) string {
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
