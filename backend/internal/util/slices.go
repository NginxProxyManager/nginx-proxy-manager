package util

import (
	"strconv"
	"strings"
)

// SliceContainsItem returns whether the slice given contains the item given
func SliceContainsItem(slice []string, item string) bool {
	for _, a := range slice {
		if a == item {
			return true
		}
	}
	return false
}

// SliceContainsInt returns whether the slice given contains the item given
func SliceContainsInt(slice []int, item int) bool {
	for _, a := range slice {
		if a == item {
			return true
		}
	}
	return false
}

// ConvertIntSliceToString returns a comma separated string of all items in the slice
func ConvertIntSliceToString(slice []int) string {
	strs := []string{}
	for _, item := range slice {
		strs = append(strs, strconv.Itoa(item))
	}
	return strings.Join(strs, ",")
}

// ConvertStringSliceToInterface is required in some special cases
func ConvertStringSliceToInterface(slice []string) []interface{} {
	res := make([]interface{}, len(slice))
	for i := range slice {
		res[i] = slice[i]
	}
	return res
}
