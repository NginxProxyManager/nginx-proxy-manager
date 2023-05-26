package entity

import (
	"fmt"
	"reflect"
	"strings"

	"npm/internal/model"
)

// FilterMapFunction is a filter map function
type FilterMapFunction func(value []string) []string

// GenerateSQLFromFilters will return a Query and params for use as WHERE clause in SQL queries
// This will use a AND where clause approach.
func GenerateSQLFromFilters(filters []model.Filter, fieldMap map[string]string, fieldMapFunctions map[string]FilterMapFunction) (string, []interface{}) {
	clauses := make([]string, 0)
	params := make([]interface{}, 0)

	for _, filter := range filters {
		// Lookup this filter field from the functions map
		if _, ok := fieldMapFunctions[filter.Field]; ok {
			filter.Value = fieldMapFunctions[filter.Field](filter.Value)
		}

		// Lookup this filter field from the name map
		if _, ok := fieldMap[filter.Field]; ok {
			filter.Field = fieldMap[filter.Field]
		}

		// Special case for LIKE queries, the column needs to be uppercase for comparison
		fieldName := fmt.Sprintf("`%s`", filter.Field)
		if strings.ToLower(filter.Modifier) == "contains" || strings.ToLower(filter.Modifier) == "starts" || strings.ToLower(filter.Modifier) == "ends" {
			fieldName = fmt.Sprintf("UPPER(`%s`)", filter.Field)
		}

		clauses = append(clauses, fmt.Sprintf("%s %s", fieldName, getSQLAssignmentFromModifier(filter, &params)))
	}

	return strings.Join(clauses, " AND "), params
}

func getSQLAssignmentFromModifier(filter model.Filter, params *[]interface{}) string {
	var clause string

	// Quick hacks
	if filter.Modifier == "in" && len(filter.Value) == 1 {
		filter.Modifier = "equals"
	} else if filter.Modifier == "notin" && len(filter.Value) == 1 {
		filter.Modifier = "not"
	}

	switch strings.ToLower(filter.Modifier) {
	default:
		clause = "= ?"
	case "not":
		clause = "!= ?"
	case "min":
		clause = ">= ?"
	case "max":
		clause = "<= ?"
	case "greater":
		clause = "> ?"
	case "lesser":
		clause = "< ?"

	// LIKE modifiers:
	case "contains":
		*params = append(*params, strings.ToUpper(filter.Value[0]))
		return "LIKE '%' || ? || '%'"
	case "starts":
		*params = append(*params, strings.ToUpper(filter.Value[0]))
		return "LIKE ? || '%'"
	case "ends":
		*params = append(*params, strings.ToUpper(filter.Value[0]))
		return "LIKE '%' || ?"

	// Array parameter modifiers:
	case "in":
		s, p := buildInArray(filter.Value)
		*params = append(*params, p...)
		return fmt.Sprintf("IN (%s)", s)
	case "notin":
		s, p := buildInArray(filter.Value)
		*params = append(*params, p...)
		return fmt.Sprintf("NOT IN (%s)", s)
	}

	*params = append(*params, filter.Value[0])
	return clause
}

/*
// GetFilterMap returns the filter map
func GetFilterMap(m interface{}) map[string]string {
	var filterMap = make(map[string]string)

	// TypeOf returns the reflection Type that represents the dynamic type of variable.
	// If variable is a nil interface value, TypeOf returns nil.
	t := reflect.TypeOf(m)

	// Iterate over all available fields and read the tag value
	for i := 0; i < t.NumField(); i++ {
		// Get the field, returns https://golang.org/pkg/reflect/#StructField
		field := t.Field(i)

		// Get the field tag value
		filterTag := field.Tag.Get("filter")
		dbTag := field.Tag.Get("db")
		if filterTag != "" && dbTag != "" && dbTag != "-" && filterTag != "-" {
			// Filter tag can be a 2 part thing: name,type
			// ie: account_id,integer
			// So we need to split and use the first part
			parts := strings.Split(filterTag, ",")
			filterMap[parts[0]] = dbTag
			filterMap[filterTag] = dbTag
		}
	}

	return filterMap
}
*/

// GetDBColumns returns the db columns
func GetDBColumns(m interface{}) []string {
	var columns []string
	t := reflect.TypeOf(m)

	for i := 0; i < t.NumField(); i++ {
		field := t.Field(i)
		dbTag := field.Tag.Get("db")
		if dbTag != "" && dbTag != "-" {
			columns = append(columns, dbTag)
		}
	}

	return columns
}

func buildInArray(items []string) (string, []interface{}) {
	// Query string placeholder
	strs := make([]string, len(items))
	for i := 0; i < len(items); i++ {
		strs[i] = "?"
	}

	// Params as interface
	params := make([]interface{}, len(items))
	for i, v := range items {
		params[i] = v
	}

	return strings.Join(strs, ", "), params
}
