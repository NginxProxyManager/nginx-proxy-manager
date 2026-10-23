// Package sso persists administrator SSO configuration, independently of protocols.
package sso

type Protocol string

const (
	OIDC   Protocol = "oidc"
	OAuth2 Protocol = "oauth2"
	SAML   Protocol = "saml"
)

type LoginMode string

const (
	Parallel LoginMode = "parallel"
	SSOOnly  LoginMode = "sso_only"
)

type Policy struct {
	ID        uint      `json:"-" gorm:"primaryKey"`
	Mode      LoginMode `json:"mode"`
	PublicURL string    `json:"public_url"`
	Revision  uint64    `json:"revision"`
}

func (Policy) TableName() string { return "sso_policy" }

type Connection struct {
	ID               string   `json:"id" gorm:"primaryKey;size:43"`
	Protocol         Protocol `json:"protocol"`
	Name             string   `json:"name"`
	Enabled          bool     `json:"enabled"`
	Revision         uint64   `json:"revision"`
	ConfigJSON       string   `json:"config_json"`
	SecretCiphertext []byte   `json:"-"`
}

func (Connection) TableName() string { return "sso_connection" }

type AllowlistEntry struct {
	Email string `json:"email" gorm:"primaryKey;size:254"`
}

func (AllowlistEntry) TableName() string { return "sso_allowlist" }
