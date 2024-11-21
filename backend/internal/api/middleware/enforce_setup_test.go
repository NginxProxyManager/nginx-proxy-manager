package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"npm/internal/api/middleware"
	"npm/internal/config"

	"github.com/stretchr/testify/assert"
	"go.uber.org/goleak"
)

func TestEnforceSetup(t *testing.T) {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(t, goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	tests := []struct {
		name         string
		isSetup      bool
		expectedCode int
	}{
		{
			name:         "should allow request when setup is expected and is setup",
			isSetup:      true,
			expectedCode: http.StatusOK,
		},
		{
			name:         "should error when setup is expected but not setup",
			isSetup:      false,
			expectedCode: http.StatusForbidden,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			config.IsSetup = tt.isSetup

			handler := middleware.EnforceSetup()(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(http.StatusOK)
			}))

			req := httptest.NewRequest(http.MethodGet, "/", nil)
			w := httptest.NewRecorder()
			handler.ServeHTTP(w, req)
			assert.Equal(t, tt.expectedCode, w.Code)
		})
	}
}
