package tags

import (
	"testing"

	"npm/internal/model"

	"github.com/stretchr/testify/assert"
	"go.uber.org/goleak"
)

func TestGetName(t *testing.T) {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(t, goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	type testDemo struct {
		UserID uint   `json:"user_id" gorm:"column:user_id" filter:"user_id,integer"`
		Type   string `json:"type" gorm:"column:type" filter:"type,string"`
	}

	m := testDemo{UserID: 10, Type: "test"}
	assert.Equal(t, "tags.testDemo", getName(m))
}

func TestCache(t *testing.T) {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(t, goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

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
