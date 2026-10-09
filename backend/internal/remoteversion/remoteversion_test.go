package remoteversion

import (
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"npm/internal/config"

	"github.com/stretchr/testify/assert"
)

func TestIsNewer(t *testing.T) {
	tests := []struct {
		current, latest string
		want            bool
	}{
		{"v2.12.0", "v2.12.1", true},
		{"v2.12.1", "v2.12.1", false},
		{"v2.12.1", "v2.12.0", false},
		{"v2.9.0", "v2.10.0", true},
		{"v2.12.0", "v3.0.0", true},
		{"v3.0.0", "v2.99.99", false},
		{"2.12.0", "v2.12.1", true},
		{"v2.12", "v2.12.1", true},
		{"v2.12.0", "v2.12", false},
	}
	for _, tt := range tests {
		t.Run(tt.current+"->"+tt.latest, func(t *testing.T) {
			assert.Equal(t, tt.want, IsNewer(tt.current, tt.latest))
		})
	}
}

func TestCheck(t *testing.T) {
	config.Version = "2.12.0"

	var calls atomic.Int32
	status := http.StatusOK
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls.Add(1)
		w.WriteHeader(status)
		_, _ = w.Write([]byte(`{"tag_name":"v2.13.0"}`))
	}))
	defer srv.Close()

	c := NewChecker(srv.URL)

	r := c.Check()
	assert.Equal(t, Result{Current: "v2.12.0", Latest: "v2.13.0", UpdateAvailable: true}, r)

	// cached
	c.Check()
	assert.EqualValues(t, 1, calls.Load())
}

func TestCheckFailureIsCached(t *testing.T) {
	config.Version = "2.12.0"

	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls.Add(1)
		w.WriteHeader(http.StatusForbidden)
	}))
	defer srv.Close()

	c := NewChecker(srv.URL)
	assert.Equal(t, Result{}, c.Check())
	assert.Equal(t, Result{}, c.Check())
	assert.EqualValues(t, 1, calls.Load())
}

func TestCheckNoVersion(t *testing.T) {
	config.Version = ""
	assert.Equal(t, Result{}, NewChecker("http://127.0.0.1:1").Check())
}
