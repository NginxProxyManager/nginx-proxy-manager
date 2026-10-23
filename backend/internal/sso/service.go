package sso

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"io"
	"sync"
	"time"

	"gorm.io/gorm"

	"npm/internal/authpolicy"
	"npm/internal/config"
	ssoconfig "npm/internal/entity/sso"
	"npm/internal/entity/user"
	"npm/internal/secretstore"
)

type Option func(*Service)
type Service struct {
	db        *gorm.DB
	secrets   *secretstore.Store
	adapters  map[ssoconfig.Protocol]Adapter
	now       func() time.Time
	entropy   io.Reader
	entropyMu sync.Mutex
}

// WithClock controls transaction, handoff and replay deadlines. The session
// store additionally validates new sessions against authoritative wall time.
func WithClock(fn func() time.Time) Option {
	return func(s *Service) {
		if fn != nil {
			s.now = fn
		}
	}
}
func WithEntropy(r io.Reader) Option {
	return func(s *Service) {
		if r != nil {
			s.entropy = r
		}
	}
}
func NewService(db *gorm.DB, secrets *secretstore.Store, adapters map[ssoconfig.Protocol]Adapter, options ...Option) *Service {
	s := &Service{db: db, secrets: secrets, adapters: make(map[ssoconfig.Protocol]Adapter), now: func() time.Time { return time.Now().UTC() }, entropy: rand.Reader}
	for k, v := range adapters {
		s.adapters[k] = v
	}
	for _, option := range options {
		if option != nil {
			option(s)
		}
	}
	return s
}
func (s *Service) fence(ctx context.Context, fn func(*gorm.DB) error) error {
	return authpolicy.WithDB(ctx, s.db, fn)
}
func (s *Service) ready() bool { return s != nil && s.db != nil && s.secrets != nil && config.IsSetup }
func (s *Service) opaque() (string, error) {
	s.entropyMu.Lock()
	defer s.entropyMu.Unlock()
	var b [32]byte
	if _, err := io.ReadFull(s.entropy, b[:]); err != nil {
		return "", ErrDenied
	}
	return base64.RawURLEncoding.EncodeToString(b[:]), nil
}

// NewBrowserToken creates the per-attempt cookie value before Begin.
func (s *Service) NewBrowserToken() (string, error) { return s.opaque() }
func validOpaque(v string) bool {
	b, err := base64.RawURLEncoding.DecodeString(v)
	return err == nil && len(b) == 32 && len(v) == 43 && base64.RawURLEncoding.EncodeToString(b) == v
}
func hash(v string) string { sum := sha256.Sum256([]byte(v)); return hex.EncodeToString(sum[:]) }
func (s *Service) connection(tx *gorm.DB, id string, revision *uint64) (ssoconfig.Connection, error) {
	c, err := ssoconfig.GetConnection(tx, id)
	if err != nil || !c.Enabled || c.Revision == 0 || s.adapters[c.Protocol] == nil || (revision != nil && c.Revision != *revision) {
		return ssoconfig.Connection{}, ErrDenied
	}
	return c, nil
}
func allowed(tx *gorm.DB, email string) error {
	var v ssoconfig.AllowlistEntry
	if tx.First(&v, "email = ?", email).Error != nil {
		return ErrDenied
	}
	return nil
}
func accountValid(u user.Model, email string) bool {
	return u.ID != 0 && !u.IsDisabled && !u.IsSystem && u.NormalizedEmail != nil && *u.NormalizedEmail == email
}
