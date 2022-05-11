package middleware

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	c "npm/internal/api/context"
	h "npm/internal/api/http"
	"npm/internal/model"
	"npm/internal/util"
	"strings"

	"github.com/qri-io/jsonschema"
)

// Filters will accept a pre-defined schemaData to validate against the GET query params
// passed in to this endpoint. This will ensure that the filters are not injecting SQL.
// After we have determined what the Filters are to be, they are saved on the Context
// to be used later in other endpoints.
func Filters(schemaData string) func(http.Handler) http.Handler {
	reservedFilterKeys := []string{
		"limit",
		"offset",
		"sort",
		"order",
		"expand",
		"t", // This is used as a timestamp paramater in some clients and can be ignored
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			var filters []model.Filter
			for key, val := range r.URL.Query() {
				key = strings.ToLower(key)

				// Split out the modifier from the field name and set a default modifier
				var keyParts []string
				keyParts = strings.Split(key, ":")
				if len(keyParts) == 1 {
					// Default modifier
					keyParts = append(keyParts, "equals")
				}

				// Only use this filter if it's not a reserved get param
				if !util.SliceContainsItem(reservedFilterKeys, keyParts[0]) {
					for _, valItem := range val {
						// Check that the val isn't empty
						if len(strings.TrimSpace(valItem)) > 0 {
							valSlice := []string{valItem}
							if keyParts[1] == "in" || keyParts[1] == "notin" {
								valSlice = strings.Split(valItem, ",")
							}

							filters = append(filters, model.Filter{
								Field:    keyParts[0],
								Modifier: keyParts[1],
								Value:    valSlice,
							})
						}
					}
				}
			}

			// Only validate schema if there are filters to validate
			if len(filters) > 0 {
				ctx := r.Context()

				// Marshal the Filters in to a JSON string so that the Schema Validation works against it
				filterData, marshalErr := json.MarshalIndent(filters, "", "  ")
				if marshalErr != nil {
					h.ResultErrorJSON(w, r, http.StatusInternalServerError, fmt.Sprintf("Schema Fatal: %v", marshalErr), nil)
					return
				}

				// Create root schema
				rs := &jsonschema.Schema{}
				if err := json.Unmarshal([]byte(schemaData), rs); err != nil {
					h.ResultErrorJSON(w, r, http.StatusInternalServerError, fmt.Sprintf("Schema Fatal: %v", err), nil)
					return
				}

				// Validate it
				errors, jsonError := rs.ValidateBytes(ctx, filterData)
				if jsonError != nil {
					h.ResultErrorJSON(w, r, http.StatusBadRequest, jsonError.Error(), nil)
					return
				}

				if len(errors) > 0 {
					h.ResultErrorJSON(w, r, http.StatusBadRequest, "Invalid Filters", errors)
					return
				}

				ctx = context.WithValue(ctx, c.FiltersCtxKey, filters)
				next.ServeHTTP(w, r.WithContext(ctx))

			} else {
				next.ServeHTTP(w, r)
			}
		})
	}
}

// GetFiltersFromContext returns the Filters
func GetFiltersFromContext(r *http.Request) []model.Filter {
	filters, ok := r.Context().Value(c.FiltersCtxKey).([]model.Filter)
	if !ok {
		// the assertion failed
		var emptyFilters []model.Filter
		return emptyFilters
	}
	return filters
}
