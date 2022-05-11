package certificateauthority

import (
	"npm/internal/entity"
)

var filterMapFunctions = make(map[string]entity.FilterMapFunction)

// getFilterMapFunctions is a map of functions that should be executed
// during the filtering process, if a field is defined here then the value in
// the filter will be given to the defined function and it will return a new
// value for use in the sql query.
func getFilterMapFunctions() map[string]entity.FilterMapFunction {
	// if len(filterMapFunctions) == 0 {
	// TODO: See internal/model/file_item.go:620 for an example
	// }

	return filterMapFunctions
}

// GetFilterSchema returns filter schema
func GetFilterSchema() string {
	var m Model
	return entity.GetFilterSchema(m)
}
