package util

import (
	"slices"
	"strconv"
	"strings"
)

// SliceContainsItem returns whether the slice given contains the item given
func SliceContainsItem(slice []string, item string) bool {
	return slices.Contains(slice, item)
}

// SliceContainsInt returns whether the slice given contains the item given
func SliceContainsInt(slice []int, item int) bool {
	return slices.Contains(slice, item)
}

// ConvertIntSliceToString returns a comma separated string of all items in the slice
func ConvertIntSliceToString(slice []int) string {
	strs := make([]string, 0, len(slice))
	for _, item := range slice {
		strs = append(strs, strconv.Itoa(item))
	}
	return strings.Join(strs, ",")
}

// ConvertStringSliceToInterface is required in some special cases
func ConvertStringSliceToInterface(slice []string) []any {
	res := make([]any, len(slice))
	for i := range slice {
		res[i] = slice[i]
	}
	return res
}
