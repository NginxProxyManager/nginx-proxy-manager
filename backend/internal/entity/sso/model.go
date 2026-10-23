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
	ID        uint      `json:"-" gorm:"column:id;primaryKey"`
	Mode      LoginMode `json:"mode" gorm:"column:mode"`
	PublicURL string    `json:"public_url" gorm:"column:public_url"`
	Revision  uint64    `json:"revision" gorm:"column:revision"`
}

func (Policy) TableName() string { return "sso_policy" }

type Connection struct {
	ID               string   `json:"id" gorm:"column:id;primaryKey;size:43"`
	Protocol         Protocol `json:"protocol" gorm:"column:protocol"`
	Name             string   `json:"name" gorm:"column:name"`
	Enabled          bool     `json:"enabled" gorm:"column:enabled"`
	Revision         uint64   `json:"revision" gorm:"column:revision"`
	ConfigJSON       string   `json:"config_json" gorm:"column:config_json"`
	SecretCiphertext []byte   `json:"-" gorm:"column:secret_ciphertext"`
}

func (Connection) TableName() string { return "sso_connection" }

type AllowlistEntry struct {
	Email string `json:"email" gorm:"column:email;primaryKey;size:254"`
}

func (AllowlistEntry) TableName() string { return "sso_allowlist" }
