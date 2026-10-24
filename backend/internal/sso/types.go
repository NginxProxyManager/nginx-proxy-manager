// Package sso coordinates protocol adapters with shared browser-bound admission.
package sso

import (
	"context"
	"errors"
	"net/http"
	"time"

	ssoconfig "npm/internal/entity/sso"
)

// ReplayID must come from a validated signed assertion/response, never request
// query parameters. ExpiresAt is the signed validity bound validated by adapter.
type ReplayID struct {
	ID        string
	ExpiresAt time.Time
}
type Identity struct {
	Subject, Email, Name string
	ReplayIDs            []ReplayID
}
type Transaction struct {
	ID, ConnectionID, BrowserHash, StateHash, Nonce, PKCEVerifier, RequestID string
	PublicURL                                                                string // Validated policy origin, transient only.
	State                                                                    string // Outbound only; only its hash is persisted.
	ConnectionRevision                                                       uint64
	ReturnPath                                                               string
	ExpiresAt                                                                time.Time
}
type StartResult struct{ RedirectURL, AttemptID string }
type Adapter interface {
	Start(context.Context, ssoconfig.Connection, Transaction) (StartResult, error)
	Complete(context.Context, ssoconfig.Connection, Transaction, *http.Request) (Identity, error)
}

// ErrDenied intentionally reveals no account existence or provider response.
var ErrDenied = errors.New("sso_login_denied")
