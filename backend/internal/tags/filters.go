package tags

import (
	"reflect"
	"regexp"
	"strings"

	"npm/internal/model"
)

func GetFilterMap(m interface{}) map[string]model.FilterMapValue {
	name := getName(m)
	if val, exists := getCache(name); exists {
		return val
	}

	var filterMap = make(map[string]model.FilterMapValue)

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
				filterMap[parts[0]] = model.FilterMapValue{
					Type:  parts[1],
					Field: dbField,
				}
			}
		}
	}

	setCache(name, filterMap)
	return filterMap
}
