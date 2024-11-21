package util

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"go.uber.org/goleak"
)

func TestFindItemInInterface(t *testing.T) {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(t, goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	obj := map[string]any{
		"key1": "value1",
		"key2": 10,
		"key3": map[string]any{
			"nestedKey": "nestedValue",
		},
		"key4": []any{"item1", "item2"},
	}

	// Test case 1: Key exists at the top level
	result, found := FindItemInInterface("key1", obj)
	assert.Equal(t, true, found)
	assert.Equal(t, "value1", result)

	// Test case 2: Key exists at a nested level
	result, found = FindItemInInterface("nestedKey", obj)
	assert.Equal(t, true, found)
	assert.Equal(t, "nestedValue", result)

	// Test case 3: Key does not exist
	result, found = FindItemInInterface("nonExistentKey", obj)
	assert.Equal(t, false, found)
	assert.Equal(t, nil, result)
}
