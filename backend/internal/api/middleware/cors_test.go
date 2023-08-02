package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"npm/internal/api/middleware"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/assert"
)

func TestCors(t *testing.T) {
	r := chi.NewRouter()
	r.Use(middleware.Cors(r))

	r.Get("/test", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("test"))
	})

	req, err := http.NewRequest("GET", "/test", nil)
	assert.Nil(t, err)

	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	assert.Equal(t, "GET,OPTIONS", rr.Header().Get("Access-Control-Allow-Methods"))
	assert.Equal(t, "Authorization,Host,Content-Type,Connection,User-Agent,Cache-Control,Accept-Encoding", rr.Header().Get("Access-Control-Allow-Headers"))
	assert.Equal(t, "test", rr.Body.String())
}

func TestCorsNoRoute(t *testing.T) {
	r := chi.NewRouter()
	r.Use(middleware.Cors(r))

	req, err := http.NewRequest("GET", "/test", nil)
	assert.Nil(t, err)

	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	assert.Equal(t, "", rr.Header().Get("Access-Control-Allow-Methods"))
	assert.Equal(t, "", rr.Header().Get("Access-Control-Allow-Headers"))
}

func TestOptions(t *testing.T) {
	r := chi.NewRouter()
	r.Use(middleware.Options(r))

	r.Get("/test", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("test"))
	})

	req, err := http.NewRequest("OPTIONS", "/test", nil)
	assert.Nil(t, err)

	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	assert.Equal(t, "*", rr.Header().Get("Access-Control-Allow-Origin"))
	assert.Equal(t, "application/json", rr.Header().Get("Content-Type"))
	assert.Equal(t, "{}", rr.Body.String())
}

func TestOptionsNoRoute(t *testing.T) {
	r := chi.NewRouter()
	r.Use(middleware.Options(r))

	req, err := http.NewRequest("OPTIONS", "/test", nil)
	assert.Nil(t, err)

	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	assert.Equal(t, "", rr.Header().Get("Access-Control-Allow-Origin"))
	assert.Equal(t, "", rr.Header().Get("Access-Control-Allow-Methods"))
	assert.Equal(t, "", rr.Header().Get("Access-Control-Allow-Headers"))
}
