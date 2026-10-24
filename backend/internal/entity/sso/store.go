package sso

import (
	"fmt"
	"gorm.io/gorm"
	"net/mail"
	"strings"
)

// NormalizeEmail accepts complete, unadorned mailboxes only. The allowlist
// deliberately has no wildcard, display-name or domain-rule syntax.
func NormalizeEmail(raw string) (string, error) {
	value := strings.ToLower(strings.TrimSpace(raw))
	if len(value) > 254 || strings.ContainsAny(value, "*\r\n") {
		return "", fmt.Errorf("invalid complete email address")
	}
	parsed, err := mail.ParseAddress(value)
	if err != nil || parsed.Address != value || parsed.Name != "" {
		return "", fmt.Errorf("invalid complete email address")
	}
	return value, nil
}

func GetPolicy(tx *gorm.DB) (Policy, error) {
	var value Policy
	err := tx.First(&value, 1).Error
	return value, err
}
func GetConnection(tx *gorm.DB, id string) (Connection, error) {
	var value Connection
	err := tx.First(&value, "id = ?", id).Error
	return value, err
}
