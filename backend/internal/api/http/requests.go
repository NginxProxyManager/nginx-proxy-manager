package http

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/qri-io/jsonschema"
)

var (
	// ErrInvalidJSON ...
	ErrInvalidJSON = errors.New("JSON is invalid")
	// ErrInvalidPayload ...
	ErrInvalidPayload = errors.New("Payload is invalid")
)

// ValidateRequestSchema takes a Schema and the Content to validate against it
func ValidateRequestSchema(schema string, requestBody []byte) ([]jsonschema.KeyError, error) {
	var jsonErrors []jsonschema.KeyError
	var schemaBytes = []byte(schema)

	// Make sure the body is valid JSON
	if !isJSON(requestBody) {
		return jsonErrors, ErrInvalidJSON
	}

	rs := &jsonschema.Schema{}
	if err := json.Unmarshal(schemaBytes, rs); err != nil {
		return jsonErrors, err
	}

	var validationErr error
	ctx := context.TODO()
	if jsonErrors, validationErr = rs.ValidateBytes(ctx, requestBody); len(jsonErrors) > 0 {
		return jsonErrors, validationErr
	}

	// Valid
	return nil, nil
}

func isJSON(bytes []byte) bool {
	var js map[string]interface{}
	return json.Unmarshal(bytes, &js) == nil
}
