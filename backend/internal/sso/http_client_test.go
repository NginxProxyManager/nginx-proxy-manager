package sso

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestProviderHTTPBoundsAndRedirects(t *testing.T) {
	client := NewProviderClient()
	require.Equal(t, 10*time.Second, client.Timeout)
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/large":
			_, _ = io.WriteString(w, strings.Repeat("x", 1<<20+1))
		case "/redirect":
			http.Redirect(w, r, "https://other.example/target", http.StatusFound)
		default:
			_, _ = io.WriteString(w, `{"ok":true}`)
		}
	}))
	defer server.Close()
	_, err := client.Get(server.URL)
	require.Error(t, err, "untrusted TLS must fail")
	client = boundedProviderClient(server.Client().Transport)
	resp, err := client.Get(server.URL + "/large")
	require.NoError(t, err)
	_, err = io.ReadAll(resp.Body)
	require.Error(t, err, "oversized provider body must fail")
	_ = resp.Body.Close()
	resp, err = client.Get(server.URL + "/redirect")
	require.Error(t, err, "cross-origin redirect must fail")
	require.NotNil(t, resp)
	_ = resp.Body.Close()
}
