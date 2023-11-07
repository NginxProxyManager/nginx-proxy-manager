package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"npm/internal/api/middleware"

	"github.com/stretchr/testify/assert"
	"go.uber.org/goleak"
)

func TestAccessControl(t *testing.T) {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(t, goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	rr := httptest.NewRecorder()
	req, err := http.NewRequest("GET", "/", nil)
	assert.Nil(t, err)
	accessControl := middleware.AccessControl(handler)
	accessControl.ServeHTTP(rr, req)
	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Equal(t, "*", rr.Header().Get("Access-Control-Allow-Origin"))
}
