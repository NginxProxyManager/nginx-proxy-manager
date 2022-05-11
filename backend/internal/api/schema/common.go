package schema

import "fmt"

func strictString(value string) string {
	return fmt.Sprintf(`{
		"type": "string",
		"pattern": "^%s$"
	}`, value)
}

const intMinOne = `
{
	"type": "integer",
	"minimum": 1
}
`

const boolean = `
{
	"type": "boolean"
}
`

func stringMinMax(minLength, maxLength int) string {
	return fmt.Sprintf(`{
		"type": "string",
		"minLength": %d,
		"maxLength": %d
	}`, minLength, maxLength)
}

func capabilties() string {
	return `{
		"type": "array",
		"minItems": 1,
		"items": {
			"type": "string",
			"minLength": 1
		}
	}`
}

func domainNames() string {
	return fmt.Sprintf(`
		{
			"type": "array",
			"minItems": 1,
			"items": %s
		}`, stringMinMax(4, 255))
}

const anyType = `
{
	"anyOf": [
		{
			"type": "array"
		},
		{
			"type": "boolean"
		},
		{
			"type": "object"
		},
		{
			"type": "integer"
		}
	]
}
`
