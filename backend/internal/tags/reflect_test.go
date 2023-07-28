package tags

import (
	"npm/internal/model"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestGetName(t *testing.T) {
	type testDemo struct {
		UserID uint   `json:"user_id" gorm:"column:user_id" filter:"user_id,integer"`
		Type   string `json:"type" gorm:"column:type" filter:"type,string"`
	}

	m := testDemo{UserID: 10, Type: "test"}
	assert.Equal(t, "tags.testDemo", getName(m))
}

func TestCache(t *testing.T) {
	name := "testdemo"
	// Should return error
	_, exists := getCache(name)
	assert.Equal(t, false, exists)

	setCache(name, map[string]model.FilterMapValue{
		"test": {
			Field: "test",
			Type:  "test",
		},
	})

	// Should return value
	val, exists := getCache(name)
	assert.Equal(t, true, exists)
	assert.Equal(t, "test", val["test"].Field)
	assert.Equal(t, "test", val["test"].Type)
}
