package util

// MapContainsKey is fairly self explanatory
func MapContainsKey(dict map[string]any, key string) bool {
	if _, ok := dict[key]; ok {
		return true
	}
	return false
}
