package sso

import (
	"context"
	"net/http"
	"time"

	"gorm.io/gorm"

	"npm/internal/entity/session"
	ssoconfig "npm/internal/entity/sso"
	"npm/internal/entity/user"
)

type handoffRow struct {
	CodeHash           string     `gorm:"column:code_hash;primaryKey"`
	BrowserHash        string     `gorm:"column:browser_hash"`
	ConnectionID       string     `gorm:"column:connection_id"`
	ConnectionRevision uint64     `gorm:"column:connection_revision"`
	UserID             uint       `gorm:"column:user_id"`
	LoginEmail         string     `gorm:"column:login_email"`
	ExpiresAt          time.Time  `gorm:"column:expires_at"`
	ConsumedAt         *time.Time `gorm:"column:consumed_at"`
}

func (handoffRow) TableName() string { return "sso_handoff" }
func (s *Service) Exchange(ctx context.Context, code, browserToken string) (session.Model, error) {
	if !s.ready() || !validOpaque(code) || !validOpaque(browserToken) {
		return session.Model{}, ErrDenied
	}
	id, err := s.opaque()
	if err != nil {
		return session.Model{}, ErrDenied
	}
	var result session.Model
	denied := false
	err = s.fence(ctx, func(tx *gorm.DB) error {
		now := s.now()
		var h handoffRow
		if tx.First(&h, "code_hash = ? AND browser_hash = ? AND consumed_at IS NULL AND expires_at > ?", hash(code), hash(browserToken), now).Error != nil {
			return ErrDenied
		}
		updated := tx.Model(&handoffRow{}).Where("code_hash = ? AND consumed_at IS NULL", h.CodeHash).Update("consumed_at", now)
		if updated.Error != nil || updated.RowsAffected != 1 {
			return ErrDenied
		}
		// A valid binding is consumed even when current admission policy denies it.
		// Return nil on denial to commit consumption without creating credentials.
		denied = true
		if _, err := s.connection(tx, h.ConnectionID, &h.ConnectionRevision); err != nil {
			return nil
		}
		if allowed(tx, h.LoginEmail) != nil {
			return nil
		}
		var account user.Model
		if tx.First(&account, h.UserID).Error != nil || !accountValid(account, h.LoginEmail) {
			return nil
		}
		result = session.Model{ID: id, UserID: h.UserID, Source: session.SSO, ConnectionID: h.ConnectionID, LoginEmail: h.LoginEmail, CreatedAt: now, ExpiresAt: now.Add(24 * time.Hour)}
		if err := session.Create(tx, result); err != nil {
			return err
		}
		denied = false
		return nil
	})
	if err != nil || denied {
		return session.Model{}, ErrDenied
	}
	return result, nil
}

// __Host- prevents a sibling subdomain from planting a parent-domain cookie.
// Distinct names preserve independent browser attempts, including SAML POSTs.
func AttemptCookie(attemptID, browserToken string, protocol ssoconfig.Protocol) *http.Cookie {
	sameSite := http.SameSiteLaxMode
	if protocol == ssoconfig.SAML {
		sameSite = http.SameSiteNoneMode
	}
	return &http.Cookie{Name: "__Host-npm-sso-attempt-" + attemptID, Value: browserToken, Path: "/", Secure: true, HttpOnly: true, SameSite: sameSite, MaxAge: 300}
}
func HandoffCookie(code, browserToken string) *http.Cookie {
	return &http.Cookie{Name: "__Host-npm-sso-handoff-" + hash(code), Value: browserToken, Path: "/", Secure: true, HttpOnly: true, SameSite: http.SameSiteLaxMode, MaxAge: 60}
}
func DeleteCookie(cookie *http.Cookie, sameSite http.SameSite) *http.Cookie {
	return &http.Cookie{
		Name: cookie.Name, Value: "", Path: "/", Secure: true, HttpOnly: true,
		SameSite: sameSite, MaxAge: -1, Expires: time.Unix(1, 0).UTC(),
	}
}
