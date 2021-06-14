package middleware

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	c "npm/internal/api/context"
	h "npm/internal/api/http"

	"github.com/qri-io/jsonschema"
)

// CheckRequestSchema ...
func CheckRequestSchema(ctx context.Context, schemaData string, payload []byte) ([]jsonschema.KeyError, error) {
	// Create root schema
	rs := &jsonschema.Schema{}
	if err := json.Unmarshal([]byte(schemaData), rs); err != nil {
		return nil, fmt.Errorf("Schema Fatal: %v", err)
	}

	// Validate it
	schemaErrors, jsonError := rs.ValidateBytes(ctx, payload)
	if jsonError != nil {
		return nil, jsonError
	}

	return schemaErrors, nil
}

// EnforceRequestSchema accepts a schema and validates the request body against it
func EnforceRequestSchema(schemaData string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {

			// Get content from context
			bodyBytes, _ := r.Context().Value(c.BodyCtxKey).([]byte)

			schemaErrors, err := CheckRequestSchema(r.Context(), schemaData, bodyBytes)
			if err != nil {
				h.ResultErrorJSON(w, r, http.StatusInternalServerError, fmt.Sprintf("Schema Fatal: %v", err), nil)
				return
			}

			if len(schemaErrors) > 0 {
				h.ResultSchemaErrorJSON(w, r, schemaErrors)
				return
			}

			// All good
			next.ServeHTTP(w, r)
		})
	}
}
