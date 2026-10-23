package sso

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"time"
	"unicode"

	"gorm.io/gorm"

	ssoconfig "npm/internal/entity/sso"
	"npm/internal/entity/user"
)

type transactionRow struct {
	ID                                   string `gorm:"primaryKey"`
	ConnectionID, BrowserHash, StateHash string
	SecretCiphertext                     []byte
	ConnectionRevision                   uint64
	ReturnPath                           string
	ExpiresAt                            time.Time
	ConsumedAt                           *time.Time
}

func (transactionRow) TableName() string { return "sso_transaction" }

type protocolMaterial struct {
	Nonce        string `json:"nonce"`
	PKCEVerifier string `json:"pkce_verifier"`
	RequestID    string `json:"request_id"`
}

func (row transactionRow) transaction(m protocolMaterial) Transaction {
	return Transaction{ID: row.ID, ConnectionID: row.ConnectionID, BrowserHash: row.BrowserHash, StateHash: row.StateHash, Nonce: m.Nonce, PKCEVerifier: m.PKCEVerifier, RequestID: m.RequestID, ConnectionRevision: row.ConnectionRevision, ReturnPath: row.ReturnPath, ExpiresAt: row.ExpiresAt}
}

// ValidateReturnPath accepts local absolute paths only. Reject repeated encoding,
// browser backslash normalization, controls and dot segments before forwarding.
func ValidateReturnPath(raw string) error {
	if raw == "" {
		return nil
	}
	if len(raw) > 2048 {
		return ErrDenied
	}
	value := raw
	for i := 0; i < 8; i++ {
		if !strings.HasPrefix(value, "/") || strings.HasPrefix(value, "//") || strings.Contains(value, "\\") || strings.IndexFunc(value, unicode.IsControl) >= 0 {
			return ErrDenied
		}
		u, err := url.Parse(value)
		if err != nil || u.IsAbs() || u.Host != "" || u.User != nil || u.Opaque != "" {
			return ErrDenied
		}
		for _, part := range strings.Split(u.Path, "/") {
			if part == "." || part == ".." {
				return ErrDenied
			}
		}
		decoded, err := url.PathUnescape(value)
		if err != nil {
			return ErrDenied
		}
		if decoded == value {
			return nil
		}
		value = decoded
	}
	return ErrDenied
}
func (s *Service) Begin(ctx context.Context, connectionID, browserToken, returnPath string) (StartResult, error) {
	if !s.ready() || !validOpaque(connectionID) || !validOpaque(browserToken) || ValidateReturnPath(returnPath) != nil {
		return StartResult{}, ErrDenied
	}
	if returnPath == "" {
		returnPath = "/"
	}
	values := make([]string, 5)
	for i := range values {
		v, err := s.opaque()
		if err != nil {
			return StartResult{}, ErrDenied
		}
		values[i] = v
	}
	row := transactionRow{ID: values[0], ConnectionID: connectionID, BrowserHash: hash(browserToken), StateHash: hash(values[1]), ReturnPath: returnPath, ExpiresAt: s.now().Add(5 * time.Minute)}
	material := protocolMaterial{Nonce: values[2], PKCEVerifier: values[3], RequestID: "_" + values[4]}
	plain, _ := json.Marshal(material)
	cipher, err := s.secrets.Seal(plain, "transaction:"+row.ID)
	if err != nil {
		return StartResult{}, ErrDenied
	}
	row.SecretCiphertext = cipher
	var connection ssoconfig.Connection
	var publicURL string
	err = s.fence(ctx, func(tx *gorm.DB) error {
		policy, err := ssoconfig.GetPolicy(tx)
		if err != nil || ssoconfig.ValidatePublicURL(policy.PublicURL) != nil {
			return ErrDenied
		}
		publicURL = policy.PublicURL
		connection, err = s.connection(tx, connectionID, nil)
		if err != nil {
			return err
		}
		row.ConnectionRevision = connection.Revision
		return tx.Create(&row).Error
	})
	if err != nil {
		return StartResult{}, ErrDenied
	}
	transaction := row.transaction(material)
	transaction.State = values[1]
	transaction.PublicURL = publicURL
	result, err := s.adapters[connection.Protocol].Start(ctx, connection, transaction)
	if err != nil {
		_ = s.fence(ctx, func(tx *gorm.DB) error { return tx.Delete(&transactionRow{}, "id = ?", row.ID).Error })
		return StartResult{}, ErrDenied
	}
	result.AttemptID = row.ID
	return result, nil
}

// CallbackState supports OAuth/OIDC query state and SAML POST RelayState.
// Duplicate or conflicting bindings are denied. HTTP handlers must bound bodies
// before parsing SAML POSTs; ParseForm itself applies the standard 10 MB limit.
func CallbackState(r *http.Request) (string, error) {
	if r == nil {
		return "", ErrDenied
	}
	if err := r.ParseForm(); err != nil {
		return "", ErrDenied
	}
	var state string
	count := 0
	for _, key := range []string{"state", "RelayState"} {
		for _, v := range r.Form[key] {
			state = v
			count++
		}
	}
	if count != 1 || !validOpaque(state) {
		return "", ErrDenied
	}
	return state, nil
}

// AttemptID resolves only the cookie selector. It does not authorize admission.
func (s *Service) AttemptID(ctx context.Context, connectionID, state string) (string, error) {
	if !s.ready() || !validOpaque(connectionID) || !validOpaque(state) {
		return "", ErrDenied
	}
	var row transactionRow
	if s.db.WithContext(ctx).Where("connection_id = ? AND state_hash = ? AND consumed_at IS NULL AND expires_at > ?", connectionID, hash(state), s.now()).First(&row).Error != nil {
		return "", ErrDenied
	}
	return row.ID, nil
}
func (s *Service) Complete(ctx context.Context, connectionID, browserToken string, r *http.Request) (string, error) {
	if !s.ready() || !validOpaque(connectionID) || !validOpaque(browserToken) {
		return "", ErrDenied
	}
	state, err := CallbackState(r)
	if err != nil {
		return "", ErrDenied
	}
	var row transactionRow
	var connection ssoconfig.Connection
	var publicURL string
	err = s.fence(ctx, func(tx *gorm.DB) error {
		policy, err := ssoconfig.GetPolicy(tx)
		if err != nil || ssoconfig.ValidatePublicURL(policy.PublicURL) != nil {
			return ErrDenied
		}
		publicURL = policy.PublicURL
		now := s.now()
		if tx.Where("connection_id = ? AND state_hash = ? AND browser_hash = ? AND consumed_at IS NULL AND expires_at > ?", connectionID, hash(state), hash(browserToken), now).First(&row).Error != nil {
			return ErrDenied
		}
		connection, err = s.connection(tx, connectionID, &row.ConnectionRevision)
		if err != nil {
			return err
		}
		updated := tx.Model(&transactionRow{}).Where("id = ? AND consumed_at IS NULL", row.ID).Update("consumed_at", now)
		if updated.Error != nil || updated.RowsAffected != 1 {
			return ErrDenied
		}
		return nil
	})
	if err != nil {
		return "", ErrDenied
	}
	// The consumed marker commits before any provider network operation.
	plain, err := s.secrets.Unseal(row.SecretCiphertext, "transaction:"+row.ID)
	if err != nil {
		return "", ErrDenied
	}
	var material protocolMaterial
	if json.Unmarshal(plain, &material) != nil {
		return "", ErrDenied
	}
	transaction := row.transaction(material)
	transaction.PublicURL = publicURL
	identity, err := s.adapters[connection.Protocol].Complete(ctx, connection, transaction, r)
	if err != nil {
		return "", ErrDenied
	}
	if connection.Protocol == ssoconfig.SAML && len(identity.ReplayIDs) == 0 {
		return "", ErrDenied
	}
	email, err := ssoconfig.NormalizeEmail(identity.Email)
	if err != nil {
		return "", ErrDenied
	}
	code, err := s.opaque()
	if err != nil {
		return "", ErrDenied
	}
	err = s.fence(ctx, func(tx *gorm.DB) error {
		now := s.now()
		var current transactionRow
		// Reload: sensitive policy writes delete this row; cosmetic edits advance its
		// revision. The stale copy from before network validation is never authority.
		if tx.First(&current, "id = ? AND consumed_at IS NOT NULL AND expires_at > ?", row.ID, now).Error != nil {
			return ErrDenied
		}
		if _, err := s.connection(tx, current.ConnectionID, &current.ConnectionRevision); err != nil {
			return err
		}
		if allowed(tx, email) != nil {
			return ErrDenied
		}
		if err := recordReplay(tx, current.ConnectionID, identity.ReplayIDs, now); err != nil {
			return err
		}
		account, _, err := user.GetOrCreateSSO(tx, email, identity.Name)
		if err != nil || !accountValid(account, email) {
			return ErrDenied
		}
		handoff := handoffRow{CodeHash: hash(code), BrowserHash: current.BrowserHash, ConnectionID: current.ConnectionID, ConnectionRevision: current.ConnectionRevision, UserID: account.ID, LoginEmail: email, ExpiresAt: now.Add(time.Minute)}
		if err := tx.Create(&handoff).Error; err != nil {
			return err
		}
		return tx.Delete(&transactionRow{}, "id = ?", row.ID).Error
	})
	if err != nil {
		return "", ErrDenied
	}
	return code, nil
}

type replayRow struct {
	ID           string `gorm:"primaryKey"`
	ConnectionID string
	ExpiresAt    time.Time
}

func (replayRow) TableName() string { return "sso_replay" }
func recordReplay(tx *gorm.DB, connectionID string, ids []ReplayID, now time.Time) error {
	for _, value := range ids {
		if value.ID == "" || len(value.ID) > 4096 || value.ExpiresAt.IsZero() || !value.ExpiresAt.Add(2*time.Minute).After(now) {
			return ErrDenied
		}
		id := hash(connectionID + "\x00" + value.ID)
		if err := tx.Delete(&replayRow{}, "id = ? AND expires_at <= ?", id, now).Error; err != nil {
			return err
		}
		if err := tx.Create(&replayRow{ID: id, ConnectionID: connectionID, ExpiresAt: value.ExpiresAt.Add(2 * time.Minute)}).Error; err != nil {
			return ErrDenied
		}
	}
	return nil
}
