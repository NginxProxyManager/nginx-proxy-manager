package entity

import (
	"reflect"
	"regexp"
	"strings"
)

type filterMapValue struct {
	Type  string
	Field string
}

// GetFilterMap returns the filter map
func GetFilterMap(m interface{}, includeBaseEntity bool) map[string]filterMapValue {
	filterMap := getFilterMapForInterface(m)
	if includeBaseEntity {
		return mergeFilterMaps(getFilterMapForInterface(ModelBase{}), filterMap)
	}

	return filterMap
}

func getFilterMapForInterface(m interface{}) map[string]filterMapValue {
	var filterMap = make(map[string]filterMapValue)

	// TypeOf returns the reflection Type that represents the dynamic type of variable.
	// If variable is a nil interface value, TypeOf returns nil.
	t := reflect.TypeOf(m)

	// Iterate over all available fields and read the tag value
	for i := 0; i < t.NumField(); i++ {
		// Get the field, returns https://golang.org/pkg/reflect/#StructField
		field := t.Field(i)

		// Get the field tag value
		filterTag := field.Tag.Get("filter")
		dbTag := field.Tag.Get("gorm")
		if filterTag != "" && dbTag != "" && dbTag != "-" && filterTag != "-" {
			// db can have many parts, we need to pull out the "column:value" part
			dbField := field.Name
			r := regexp.MustCompile(`(?:^|;)column:([^;|$]+)(?:$|;)`)
			if matches := r.FindStringSubmatch(dbTag); len(matches) > 1 {
				dbField = matches[1]
			}
			// Filter tag can be a 2 part thing: name,type
			// ie: account_id,integer
			// So we need to split and use the first part
			parts := strings.Split(filterTag, ",")
			if len(parts) > 1 {
				filterMap[parts[0]] = filterMapValue{
					Type:  parts[1],
					Field: dbField,
				}
			}
		}
	}

	return filterMap
}

func mergeFilterMaps(m1 map[string]filterMapValue, m2 map[string]filterMapValue) map[string]filterMapValue {
	merged := make(map[string]filterMapValue, 0)
	for k, v := range m1 {
		merged[k] = v
	}
	for key, value := range m2 {
		merged[key] = value
	}
	return merged
}
