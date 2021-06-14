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

func stringMinMax(minLength, maxLength int) string {
	return fmt.Sprintf(`{
		"type": "string",
		"minLength": %d,
		"maxLength": %d
	}`, minLength, maxLength)
}

func userRoles() string {
	return fmt.Sprintf(`
		{
			"type": "array",
			"items": %s
		}`, stringMinMax(2, 50))
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
