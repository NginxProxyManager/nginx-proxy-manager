package middleware

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	c "npm/internal/api/context"
	h "npm/internal/api/http"
	"npm/internal/model"
	"npm/internal/tags"
	"npm/internal/util"

	"github.com/qri-io/jsonschema"
)

// ListQuery will accept a pre-defined schemaData to validate against the GET query params
// passed in to this endpoint. This will ensure that the filters are not injecting SQL
// and the sort parameter is valid as well.
// After we have determined what the Filters are to be, they are saved on the Context
// to be used later in other endpoints.
func ListQuery(obj any) func(http.Handler) http.Handler {
	schemaData := tags.GetFilterSchema(obj)
	filterMap := tags.GetFilterMap(obj, "")

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := r.Context()

			ctx, statusCode, errMsg, errors := listQueryFilters(ctx, r, schemaData)
			if statusCode > 0 {
				h.ResultErrorJSON(w, r, statusCode, errMsg, errors)
				return
			}

			ctx, statusCode, errMsg = listQuerySort(ctx, r, filterMap)
			if statusCode > 0 {
				h.ResultErrorJSON(w, r, statusCode, errMsg, nil)
				return
			}

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func listQuerySort(
	ctx context.Context,
	r *http.Request,
	filterMap map[string]model.FilterMapValue,
) (context.Context, int, string) {
	var sortFields []model.Sort

	sortString := r.URL.Query().Get("sort")
	if sortString == "" {
		return ctx, 0, ""
	}

	// Split sort fields up in to slice
	sorts := strings.Split(sortString, ",")
	for _, sortItem := range sorts {
		if strings.Contains(sortItem, ".") {
			theseItems := strings.Split(sortItem, ".")

			switch strings.ToLower(theseItems[1]) {
			case "desc":
				fallthrough
			case "descending":
				theseItems[1] = "DESC"
			default:
				theseItems[1] = "ASC"
			}

			sortFields = append(sortFields, model.Sort{
				Field:     theseItems[0],
				Direction: theseItems[1],
			})
		} else {
			sortFields = append(sortFields, model.Sort{
				Field:     sortItem,
				Direction: "ASC",
			})
		}
	}

	// check against filter schema
	for _, f := range sortFields {
		if _, exists := filterMap[f.Field]; !exists {
			return ctx, http.StatusBadRequest, "Invalid sort field"
		}
	}

	ctx = context.WithValue(ctx, c.SortCtxKey, sortFields)

	// No problems!
	return ctx, 0, ""
}

func listQueryFilters(
	ctx context.Context,
	r *http.Request,
	schemaData string,
) (context.Context, int, string, any) {
	reservedFilterKeys := []string{
		"limit",
		"offset",
		"sort",
		"expand",
		"t", // This is used as a timestamp paramater in some clients and can be ignored
	}

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
		// Marshal the Filters in to a JSON string so that the Schema Validation works against it
		filterData, marshalErr := json.MarshalIndent(filters, "", "  ")
		if marshalErr != nil {
			return ctx, http.StatusInternalServerError, fmt.Sprintf("Schema Fatal: %v", marshalErr), nil
		}

		// Create root schema
		rs := &jsonschema.Schema{}
		if err := json.Unmarshal([]byte(schemaData), rs); err != nil {
			return ctx, http.StatusInternalServerError, fmt.Sprintf("Schema Fatal: %v", err), nil
		}

		// Validate it
		errors, jsonError := rs.ValidateBytes(ctx, filterData)
		if jsonError != nil {
			return ctx, http.StatusBadRequest, jsonError.Error(), nil
		}

		if len(errors) > 0 {
			return ctx, http.StatusBadRequest, "Invalid Filters", errors
		}

		ctx = context.WithValue(ctx, c.FiltersCtxKey, filters)
	}

	// No problems!
	return ctx, 0, "", nil
}

// GetFiltersFromContext returns the Filters
func GetFiltersFromContext(r *http.Request) []model.Filter {
	filters, ok := r.Context().Value(c.FiltersCtxKey).([]model.Filter)
	if !ok {
		// the assertion failed
		return nil
	}
	return filters
}

// GetSortFromContext returns the Sort
func GetSortFromContext(r *http.Request) []model.Sort {
	sorts, ok := r.Context().Value(c.SortCtxKey).([]model.Sort)
	if !ok {
		// the assertion failed
		return nil
	}
	return sorts
}
