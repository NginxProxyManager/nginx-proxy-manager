package tags

import (
	"npm/internal/util"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestGetFilterSchema(t *testing.T) {
	m := struct {
		ID   int    `filter:"id"`
		Name string `filter:"name"`
	}{
		ID:   1,
		Name: "John",
	}

	filterSchema := util.PrettyPrintJSON(GetFilterSchema(m))

	expectedSchema := `{
  "type": "array",
  "items": {
    "oneOf": [
      {
        "type": "object",
        "properties": {
          "field": {
            "type": "string",
            "pattern": "^id$"
          },
          "modifier": {
            "type": "string",
            "pattern": "^(equals|not|contains|starts|ends|in|notin)$"
          },
          "value": {
            "oneOf": [
              {
                "type": "string",
                "minLength": 1
              },
              {
                "type": "array",
                "items": {
                  "type": "string",
                  "minLength": 1
                }
              }
            ]
          }
        }
      },
      {
        "type": "object",
        "properties": {
          "field": {
            "type": "string",
            "pattern": "^name$"
          },
          "modifier": {
            "type": "string",
            "pattern": "^(equals|not|contains|starts|ends|in|notin)$"
          },
          "value": {
            "oneOf": [
              {
                "type": "string",
                "minLength": 1
              },
              {
                "type": "array",
                "items": {
                  "type": "string",
                  "minLength": 1
                }
              }
            ]
          }
        }
      }
    ]
  }
}`

	assert.Equal(t, expectedSchema, filterSchema)
}

func TestGetFilterTagSchema(t *testing.T) {
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
