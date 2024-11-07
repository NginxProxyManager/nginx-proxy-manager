package entity

import (
	"npm/internal/model"
	"npm/internal/tags"
)

// GetFilterMap returns the filter map
func GetFilterMap(m interface{}, includeBaseEntity bool) map[string]model.FilterMapValue {
	filterMap := tags.GetFilterMap(m, "")

	// TODO: this is done in GetFilterMap isn't it?
	// if includeBaseEntity {
	// 	return mergeFilterMaps(tags.GetFilterMap(model.ModelBase{}, ""), filterMap)
	// }

	return filterMap
}
