package middleware_test

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	c "npm/internal/api/context"
	"npm/internal/api/middleware"

	"github.com/stretchr/testify/assert"
)

func TestBodyContext(t *testing.T) {
	// Create a test request with a body
	body := []byte(`{"name": "John", "age": 30}`)
	req, err := http.NewRequest("POST", "/test", bytes.NewBuffer(body))
	assert.Nil(t, err)

	// Create a test response recorder
	rr := httptest.NewRecorder()

	// Create a test handler that checks the context for the body data
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		bodyData := r.Context().Value(c.BodyCtxKey).([]byte)
		assert.Equal(t, body, bodyData)
	})

	// Wrap the handler with the BodyContext middleware
	mw := middleware.BodyContext()(handler)

	// Call the middleware with the test request and response recorder
	mw.ServeHTTP(rr, req)

	// Check that the response status code is 200
	status := rr.Code
	assert.Equal(t, http.StatusOK, status)
}
