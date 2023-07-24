package entity

import (
	"npm/internal/model"
	"npm/internal/tags"
)

// GetFilterMap returns the filter map
func GetFilterMap(m interface{}, includeBaseEntity bool) map[string]model.FilterMapValue {
	filterMap := tags.GetFilterMap(m)
	if includeBaseEntity {
		return mergeFilterMaps(tags.GetFilterMap(ModelBase{}), filterMap)
	}

	return filterMap
}

func mergeFilterMaps(m1 map[string]model.FilterMapValue, m2 map[string]model.FilterMapValue) map[string]model.FilterMapValue {
	merged := make(map[string]model.FilterMapValue, 0)
	for k, v := range m1 {
		merged[k] = v
	}
	for key, value := range m2 {
		merged[key] = value
	}
	return merged
}
