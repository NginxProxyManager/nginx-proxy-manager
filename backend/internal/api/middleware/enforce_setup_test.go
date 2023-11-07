package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"go.uber.org/goleak"

	"npm/internal/api/middleware"
	"npm/internal/config"
)

func TestEnforceSetup(t *testing.T) {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(t, goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	tests := []struct {
		name          string
		shouldBeSetup bool
		isSetup       bool
		expectedCode  int
	}{
		{
			name:          "should allow request when setup is expected and is setup",
			shouldBeSetup: true,
			isSetup:       true,
			expectedCode:  http.StatusOK,
		},
		{
			name:          "should error when setup is expected but not setup",
			shouldBeSetup: true,
			isSetup:       false,
			expectedCode:  http.StatusForbidden,
		},
		{
			name:          "should allow request when setup is not expected and not setup",
			shouldBeSetup: false,
			isSetup:       false,
			expectedCode:  http.StatusOK,
		},
		{
			name:          "should error when setup is not expected but is setup",
			shouldBeSetup: false,
			isSetup:       true,
			expectedCode:  http.StatusForbidden,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			config.IsSetup = tt.isSetup

			handler := middleware.EnforceSetup(tt.shouldBeSetup)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusOK)
			}))

			req := httptest.NewRequest(http.MethodGet, "/", nil)
			w := httptest.NewRecorder()
			handler.ServeHTTP(w, req)
			assert.Equal(t, tt.expectedCode, w.Code)
		})
	}
}
