package middleware_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	c "npm/internal/api/context"
	"npm/internal/api/middleware"

	"github.com/stretchr/testify/assert"
	"go.uber.org/goleak"
)

func TestExpansion(t *testing.T) {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(t, goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	t.Run("with expand query param", func(t *testing.T) {
		req, err := http.NewRequest("GET", "/path?expand=item1,item2", nil)
		assert.NoError(t, err)

		rr := httptest.NewRecorder()

		handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			expand := middleware.GetExpandFromContext(r)
			assert.Equal(t, []string{"item1", "item2"}, expand)
		})

		middleware.Expansion(handler).ServeHTTP(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
	})

	t.Run("without expand query param", func(t *testing.T) {
		req, err := http.NewRequest("GET", "/path", nil)
		assert.NoError(t, err)

		rr := httptest.NewRecorder()

		handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			expand := middleware.GetExpandFromContext(r)
			assert.Nil(t, expand)
		})

		middleware.Expansion(handler).ServeHTTP(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
	})
}

func TestGetExpandFromContext(t *testing.T) {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(t, goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	t.Run("with context value", func(t *testing.T) {
		req, err := http.NewRequest("GET", "/path", nil)
		assert.NoError(t, err)

		ctx := req.Context()
		ctx = context.WithValue(ctx, c.ExpansionCtxKey, []string{"item1", "item2"})
		req = req.WithContext(ctx)

		expand := middleware.GetExpandFromContext(req)
		assert.Equal(t, []string{"item1", "item2"}, expand)
	})

	t.Run("without context value", func(t *testing.T) {
		req, err := http.NewRequest("GET", "/path", nil)
		assert.NoError(t, err)

		expand := middleware.GetExpandFromContext(req)
		assert.Nil(t, expand)
	})
}
