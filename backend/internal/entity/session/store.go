package session

import (
	"context"
	"encoding/base64"
	"errors"
	"strings"
	"time"

	"gorm.io/gorm"
	"npm/internal/authpolicy"
	"npm/internal/entity/sso"
	"npm/internal/entity/user"
)

var ErrUnauthorized = errors.New("session unauthorized")

// DeliveryTimeout is also the required transport write deadline. The delivery
// callback must enforce it on its actual writer (HTTP ResponseController). A
// goroutine timeout cannot safely release a fence around an ongoing write.
const DeliveryTimeout = time.Second
const maxAncestors = 32

// Create must run in the caller's policy-fenced transaction alongside admission.
func Create(tx *gorm.DB, value Model) error {
	return createAt(tx, value, time.Now().UTC())
}

func createAt(tx *gorm.DB, value Model, now time.Time) error {
	if value.CreatedAt.IsZero() {
		value.CreatedAt = now
	}
	if !validID(value.ID) || !value.ExpiresAt.After(value.CreatedAt) || value.RevokedAt != nil {
		return ErrUnauthorized
	}
	if _, err := validate(tx, value, now); err != nil {
		return err
	}
	return tx.Create(&value).Error
}

// Authorize holds the fence only while loading current policy and permissions.
// Ordinary API request execution happens after this function returns.
func Authorize(ctx context.Context, id string, now time.Time) (Principal, error) {
	var principal Principal
	err := authpolicy.WithWrite(ctx, func(tx *gorm.DB) error {
		var err error
		principal, err = authorize(tx, id, now)
		return err
	})
	return principal, err
}

func authorize(tx *gorm.DB, id string, now time.Time) (Principal, error) {
	if !validID(id) {
		return Principal{}, ErrUnauthorized
	}
	var value Model
	if err := tx.First(&value, "id = ?", id).Error; err != nil {
		return Principal{}, authorizationError(err)
	}
	return validate(tx, value, now)
}

func validate(tx *gorm.DB, value Model, now time.Time) (Principal, error) {
	principal := Principal{Session: value, Capabilities: []string{}}
	seen := map[string]bool{}
	for depth := 0; ; depth++ {
		if depth >= maxAncestors || seen[value.ID] || value.RevokedAt != nil || !value.ExpiresAt.After(now) {
			return Principal{}, ErrUnauthorized
		}
		seen[value.ID] = true
		switch value.Source {
		case SSO:
			mail, err := sso.NormalizeEmail(value.LoginEmail)
			if err != nil || mail != value.LoginEmail || !validID(value.ConnectionID) || value.ParentID != "" {
				return Principal{}, ErrUnauthorized
			}
			connection, err := sso.GetConnection(tx, value.ConnectionID)
			if err != nil {
				return Principal{}, authorizationError(err)
			}
			if !connection.Enabled {
				return Principal{}, ErrUnauthorized
			}
			var allowed sso.AllowlistEntry
			if err := tx.First(&allowed, "email = ?", mail).Error; err != nil {
				return Principal{}, authorizationError(err)
			}
		case Local, LDAP:
			if value.ParentID != "" || value.ConnectionID != "" || value.LoginEmail != "" {
				return Principal{}, ErrUnauthorized
			}
		case Impersonation:
			if !validID(value.ParentID) || value.ConnectionID != "" || value.LoginEmail != "" {
				return Principal{}, ErrUnauthorized
			}
		default:
			return Principal{}, ErrUnauthorized
		}
		var account user.Model
		if err := tx.First(&account, value.UserID).Error; err != nil {
			return Principal{}, authorizationError(err)
		}
		if account.IsDisabled || account.IsSystem || value.UserID == 0 {
			return Principal{}, ErrUnauthorized
		}
		if depth == 0 {
			if err := tx.Model(&user.HasCapabilityModel{}).Where("user_id = ?", value.UserID).Order("capability_name").Pluck("capability_name", &principal.Capabilities).Error; err != nil {
				return Principal{}, err
			}
		}
		if value.Source != Impersonation {
			return principal, nil
		}
		var parent Model
		if err := tx.First(&parent, "id = ?", value.ParentID).Error; err != nil {
			return Principal{}, authorizationError(err)
		}
		value = parent
	}
}

func validID(id string) bool {
	decoded, err := base64.RawURLEncoding.DecodeString(id)
	return len(id) == 43 && err == nil && len(decoded) == 32
}

func authorizationError(err error) error {
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return ErrUnauthorized
	}
	return err
}

func Revoke(ctx context.Context, id string, now time.Time) error {
	return authpolicy.WithWrite(ctx, func(tx *gorm.DB) error { return RevokeMatching(tx, RevocationFilter{SessionID: id}, now) })
}

// RevokeMatching is called inside the same policy-fenced transaction as the
// configuration change. Sources selected by email/connection are SSO only.
func RevokeMatching(tx *gorm.DB, filter RevocationFilter, now time.Time) error {
	count := 0
	for _, v := range []string{filter.SessionID, filter.ConnectionID, filter.LoginEmail} {
		if v != "" {
			count++
		}
	}
	if count != 1 {
		return errors.New("exactly one revocation filter required")
	}
	query := tx.Model(&Model{})
	switch {
	case filter.SessionID != "":
		if !validID(filter.SessionID) {
			return errors.New("invalid session id")
		}
		query = query.Where("id = ?", filter.SessionID)
	case filter.ConnectionID != "":
		if !validID(filter.ConnectionID) {
			return errors.New("invalid connection id")
		}
		query = query.Where("source = ? AND connection_id = ?", SSO, filter.ConnectionID)
	default:
		mail, err := sso.NormalizeEmail(filter.LoginEmail)
		if err != nil || strings.TrimSpace(filter.LoginEmail) == "" {
			return errors.New("invalid login email")
		}
		query = query.Where("source = ? AND login_email = ?", SSO, mail)
	}
	var pending []string
	if err := query.Pluck("id", &pending).Error; err != nil {
		return err
	}
	seen := map[string]bool{}
	for len(pending) > 0 {
		id := pending[0]
		pending = pending[1:]
		if seen[id] {
			continue
		}
		seen[id] = true
		if err := tx.Model(&Model{}).Where("id = ? AND revoked_at IS NULL", id).Update("revoked_at", now).Error; err != nil {
			return err
		}
		var children []string
		if err := tx.Model(&Model{}).Where("parent_id = ? AND source = ?", id, Impersonation).Pluck("id", &children).Error; err != nil {
			return err
		}
		pending = append(pending, children...)
	}
	return nil
}

func WithAuthorizedDelivery(ctx context.Context, id string, deliver func(Principal) error) error {
	if deliver == nil {
		return errors.New("delivery callback required")
	}
	ctx, cancel := context.WithTimeout(ctx, DeliveryTimeout)
	defer cancel()
	return authpolicy.WithWrite(ctx, func(tx *gorm.DB) error {
		principal, err := authorize(tx, id, time.Now().UTC())
		if err != nil {
			return err
		}
		if err := ctx.Err(); err != nil {
			return err
		}
		return deliver(principal)
	})
}
