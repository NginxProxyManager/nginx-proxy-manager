package util

// FindItemInInterface Find key in interface (recursively) and return value as interface
func FindItemInInterface(key string, obj any) (any, bool) {
	// if the argument is not a map, ignore it
	mobj, ok := obj.(map[string]any)
	if !ok {
		return nil, false
	}

	for k, v := range mobj {
		// key match, return value
		if k == key {
			return v, true
		}

		// if the value is a map, search recursively
		if m, ok := v.(map[string]any); ok {
			if res, ok := FindItemInInterface(key, m); ok {
				return res, true
			}
		}
		// if the value is an array, search recursively
		// from each element
		if va, ok := v.([]any); ok {
			for _, a := range va {
				if res, ok := FindItemInInterface(key, a); ok {
					return res, true
				}
			}
		}
	}

	// element not found
	return nil, false
}
