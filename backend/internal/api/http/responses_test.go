package http

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"npm/internal/entity/user"
	"npm/internal/model"

	"github.com/qri-io/jsonschema"
	"github.com/stretchr/testify/assert"
	"go.uber.org/goleak"
)

func TestResultResponseJSON(t *testing.T) {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(t, goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	tests := []struct {
		name   string
		status int
		given  any
		want   string
	}{
		{
			name:   "simple response",
			status: http.StatusOK,
			given:  true,
			want:   "{\"result\":true}",
		},
		{
			name:   "detailed response",
			status: http.StatusBadRequest,
			given: user.Model{
				Base:  model.Base{ID: 10},
				Email: "me@example.com",
				Name:  "John Doe",
			},
			want: "{\"result\":{\"id\":10,\"created_at\":0,\"updated_at\":0,\"name\":\"John Doe\",\"email\":\"me@example.com\",\"is_disabled\":false,\"gravatar_url\":\"\"}}",
		},
		{
			name:   "error response",
			status: http.StatusNotFound,
			given: ErrorResponse{
				Code:    404,
				Message: "Not found",
				Invalid: []string{"your", "page", "was", "not", "found"},
			},
			want: "{\"result\":null,\"error\":{\"code\":404,\"message\":\"Not found\",\"invalid\":[\"your\",\"page\",\"was\",\"not\",\"found\"]}}",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodGet, "/anything", nil)
			w := httptest.NewRecorder()
			ResultResponseJSON(w, r, tt.status, tt.given)
			res := w.Result()
			defer res.Body.Close()
			body, err := io.ReadAll(res.Body)
			if err != nil {
				t.Errorf("expected error to be nil got %v", err)
			}
			assert.Equal(t, tt.want, string(body))
			assert.Equal(t, tt.status, res.StatusCode)
			assert.Equal(t, "application/json; charset=utf-8", res.Header.Get("Content-Type"))
		})
	}
}

func TestResultSchemaErrorJSON(t *testing.T) {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(t, goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	tests := []struct {
		name  string
		given []jsonschema.KeyError
		want  string
	}{
		{
			name: "case a",
			given: []jsonschema.KeyError{
				{
					PropertyPath: "/something",
					InvalidValue: "name",
					Message:      "Name cannot be empty",
				},
			},
			want: "{\"result\":null,\"error\":{\"code\":400,\"message\":{},\"invalid\":[{\"propertyPath\":\"/something\",\"invalidValue\":\"name\",\"message\":\"Name cannot be empty\"}]}}",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodGet, "/anything", nil)
			w := httptest.NewRecorder()
			ResultSchemaErrorJSON(w, r, tt.given)
			res := w.Result()
			defer res.Body.Close()
			body, err := io.ReadAll(res.Body)
			if err != nil {
				t.Errorf("expected error to be nil got %v", err)
			}
			assert.Equal(t, tt.want, string(body))
			assert.Equal(t, 400, res.StatusCode)
			assert.Equal(t, "application/json; charset=utf-8", res.Header.Get("Content-Type"))
		})
	}
}

func TestResultErrorJSON(t *testing.T) {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(t, goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	tests := []struct {
		name     string
		status   int
		message  string
		extended any
		want     string
	}{
		{
			name:     "case a",
			status:   http.StatusBadGateway,
			message:  "Oh not something is not acceptable",
			extended: nil,
			want:     "{\"result\":null,\"error\":{\"code\":502,\"message\":\"Oh not something is not acceptable\"}}",
		},
		{
			name:     "case b",
			status:   http.StatusNotAcceptable,
			message:  "Oh not something is not acceptable again",
			extended: []string{"name is not allowed", "dob is wrong or something"},
			want:     "{\"result\":null,\"error\":{\"code\":406,\"message\":\"Oh not something is not acceptable again\",\"invalid\":[\"name is not allowed\",\"dob is wrong or something\"]}}",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodGet, "/anything", nil)
			w := httptest.NewRecorder()
			ResultErrorJSON(w, r, tt.status, tt.message, tt.extended)
			res := w.Result()
			defer res.Body.Close()
			body, err := io.ReadAll(res.Body)
			if err != nil {
				t.Errorf("expected error to be nil got %v", err)
			}
			assert.Equal(t, tt.want, string(body))
			assert.Equal(t, tt.status, res.StatusCode)
			assert.Equal(t, "application/json; charset=utf-8", res.Header.Get("Content-Type"))
		})
	}
}

func TestNotFound(t *testing.T) {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(t, goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	t.Run("basic test", func(t *testing.T) {
		r := httptest.NewRequest(http.MethodGet, "/anything", nil)
		w := httptest.NewRecorder()
		NotFound(w, r)
		res := w.Result()
		defer res.Body.Close()
		body, err := io.ReadAll(res.Body)
		if err != nil {
			t.Errorf("expected error to be nil got %v", err)
		}
		assert.Equal(t, "{\"result\":null,\"error\":{\"code\":404,\"message\":\"Not found\"}}", string(body))
		assert.Equal(t, http.StatusNotFound, res.StatusCode)
		assert.Equal(t, "application/json; charset=utf-8", res.Header.Get("Content-Type"))
	})
}

func TestResultResponseText(t *testing.T) {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(t, goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	t.Run("basic test", func(t *testing.T) {
		w := httptest.NewRecorder()
		ResultResponseText(w, http.StatusOK, "omg this works")
		res := w.Result()
		defer res.Body.Close()
		body, err := io.ReadAll(res.Body)
		if err != nil {
			t.Errorf("expected error to be nil got %v", err)
		}
		assert.Equal(t, "omg this works", string(body))
		assert.Equal(t, http.StatusOK, res.StatusCode)
		assert.Equal(t, "text/plain; charset=utf-8", res.Header.Get("Content-Type"))
	})
}
