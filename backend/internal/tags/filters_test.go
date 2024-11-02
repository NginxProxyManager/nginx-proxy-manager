package tags

import (
	"testing"
	"time"

	"npm/internal/util"

	"github.com/stretchr/testify/assert"
	"go.uber.org/goleak"
)

func TestGetFilterSchema(t *testing.T) {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(t, goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	type testDemo struct {
		ID          uint      `json:"id" gorm:"column:user_id" filter:"id,number"`
		Created     time.Time `json:"created" gorm:"column:user_created_date" filter:"created,date"`
		Name        string    `json:"name" gorm:"column:user_name" filter:"name,string"`
		IsDisabled  string    `json:"is_disabled" gorm:"column:user_is_disabled" filter:"is_disabled,bool"`
		Permissions string    `json:"permissions" gorm:"column:user_permissions" filter:"permissions,regex"`
		History     string    `json:"history" gorm:"column:user_history" filter:"history,regex,(id|name)"`
	}

	m := testDemo{ID: 10, Name: "test"}

	filterSchema := GetFilterSchema(m)
	assert.Greater(t, len(filterSchema), 4000)
	// Trigger again for code coverage of cached item
	GetFilterSchema(m)
}

func TestGetFilterTagSchema(t *testing.T) {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(t, goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	schema := util.PrettyPrintJSON(getFilterTagSchema("id,integer"))

	expectedSchema := `{
  "type": "object",
  "properties": {
    "field": {
      "type": "string",
      "pattern": "^id$"
    },
    "modifier": {
      "type": "string",
      "pattern": "^(equals|not|contains|starts|ends|in|notin|min|max|greater|less)$"
    },
    "value": {
      "oneOf": [
        {
          "type": "string",
          "pattern": "^[0-9]+$"
        },
        {
          "type": "array",
          "items": {
            "type": "string",
            "pattern": "^[0-9]+$"
          }
        }
      ]
    }
  }
}`

	assert.Equal(t, expectedSchema, schema)
}

func TestBoolFieldSchema(t *testing.T) {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(t, goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	schema := util.PrettyPrintJSON(boolFieldSchema("active"))

	expectedSchema := `{
  "type": "object",
  "properties": {
    "field": {
      "type": "string",
      "pattern": "^active$"
    },
    "modifier": {
      "type": "string",
      "pattern": "^(equals|not)$"
    },
    "value": {
      "oneOf": [
        {
          "type": "string",
          "pattern": "^(TRUE|true|t|yes|y|on|1|FALSE|f|false|n|no|off|0)$"
        },
        {
          "type": "array",
          "items": {
            "type": "string",
            "pattern": "^(TRUE|true|t|yes|y|on|1|FALSE|f|false|n|no|off|0)$"
          }
        }
      ]
    }
  }
}`

	assert.Equal(t, expectedSchema, schema)
}
