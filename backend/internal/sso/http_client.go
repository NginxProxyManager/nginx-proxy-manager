package sso

import (
	"errors"
	"io"
	"net/http"
	"net/url"
	"time"
)

const providerBodyLimit = 1 << 20

// NewProviderClient enforces transport limits for all provider requests.
// A test may replace Transport with a trusted fixture transport; production
// keeps the standard validating TLS transport.
func NewProviderClient() *http.Client {
	return boundedProviderClient(nil)
}

func boundedProviderClient(transport http.RoundTripper) *http.Client {
	if transport == nil {
		transport = http.DefaultTransport.(*http.Transport).Clone()
	}
	return &http.Client{Timeout: 10 * time.Second, Transport: &providerTransport{base: transport}, CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) >= 10 || len(via) == 0 || !sameProviderOrigin(via[0].URL, req.URL) {
			return errors.New("provider redirect denied")
		}
		return nil
	}}
}

func sameProviderOrigin(a, b *url.URL) bool {
	return a != nil && b != nil && a.Scheme == "https" && b.Scheme == "https" && a.Host == b.Host && a.User == nil && b.User == nil
}

type providerTransport struct{ base http.RoundTripper }

func (t *providerTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	if req.URL.Scheme != "https" || req.URL.Host == "" || req.URL.User != nil {
		return nil, errors.New("provider URL denied")
	}
	resp, err := t.base.RoundTrip(req)
	if err != nil {
		return nil, errors.New("provider request failed")
	}
	resp.Body = &limitedProviderBody{reader: io.LimitReader(resp.Body, providerBodyLimit+1), closer: resp.Body}
	return resp, nil
}

type limitedProviderBody struct {
	reader io.Reader
	closer io.Closer
	read   int64
}

func (b *limitedProviderBody) Read(p []byte) (int, error) {
	n, err := b.reader.Read(p)
	b.read += int64(n)
	if b.read > providerBodyLimit {
		return 0, errors.New("provider response too large")
	}
	return n, err
}
func (b *limitedProviderBody) Close() error { return b.closer.Close() }
