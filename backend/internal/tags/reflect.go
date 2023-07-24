package tags

import (
	"fmt"
	"reflect"

	"npm/internal/model"
)

var tagCache map[string]map[string]model.FilterMapValue

// getName returns the name of the type given
func getName(m interface{}) string {
	fc := reflect.TypeOf(m)
	return fmt.Sprint(fc)
}

// getCache tries to find a cached item for this name
func getCache(name string) (map[string]model.FilterMapValue, bool) {
	if val, ok := tagCache[name]; ok {
		return val, true
	}
	return nil, false
}

// setCache sets the name to this value
func setCache(name string, val map[string]model.FilterMapValue) {
	// Hack to initialise empty map
	if len(tagCache) == 0 {
		tagCache = make(map[string]map[string]model.FilterMapValue, 0)
	}
	tagCache[name] = val
}
