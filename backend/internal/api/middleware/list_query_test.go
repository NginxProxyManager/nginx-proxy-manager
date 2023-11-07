package middleware_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	c "npm/internal/api/context"
	"npm/internal/api/middleware"
	"npm/internal/entity/user"
	"npm/internal/model"
	"npm/internal/tags"

	"github.com/stretchr/testify/assert"
	"go.uber.org/goleak"
)

func TestListQuery(t *testing.T) {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(t, goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	tests := []struct {
		name           string
		queryParams    string
		expectedStatus int
	}{
		{
			name:           "valid query params",
			queryParams:    "?name:contains=John&sort=name.desc",
			expectedStatus: http.StatusOK,
		},
		{
			name:           "invalid sort field",
			queryParams:    "?name:contains=John&sort=invalid_field",
			expectedStatus: http.StatusBadRequest,
		},
		{
			name:           "invalid filter value",
			queryParams:    "?name=123",
			expectedStatus: http.StatusOK,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req, err := http.NewRequest("GET", "/test"+tt.queryParams, nil)
			assert.NoError(t, err)

			testObj := user.Model{}

			ctx := context.Background()
			ctx = context.WithValue(ctx, c.FiltersCtxKey, tags.GetFilterSchema(testObj))

			rr := httptest.NewRecorder()
			handler := middleware.ListQuery(testObj)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusOK)
			}))

			handler.ServeHTTP(rr, req.WithContext(ctx))

			assert.Equal(t, tt.expectedStatus, rr.Code)
		})
	}
}

func TestGetFiltersFromContext(t *testing.T) {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(t, goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	req, err := http.NewRequest("GET", "/test", nil)
	assert.NoError(t, err)

	filters := []model.Filter{
		{Field: "name", Modifier: "contains", Value: []string{"test"}},
	}
	ctx := context.WithValue(req.Context(), c.FiltersCtxKey, filters)
	req = req.WithContext(ctx)

	result := middleware.GetFiltersFromContext(req)
	assert.Equal(t, filters, result)
}

func TestGetSortFromContext(t *testing.T) {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(t, goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	req, err := http.NewRequest("GET", "/test", nil)
	assert.NoError(t, err)

	sorts := []model.Sort{
		{Field: "name", Direction: "asc"},
	}
	ctx := context.WithValue(req.Context(), c.SortCtxKey, sorts)
	req = req.WithContext(ctx)

	result := middleware.GetSortFromContext(req)
	assert.Equal(t, sorts, result)
}
