package session

import "time"

type Source string

const (
	Local         Source = "local"
	LDAP          Source = "ldap"
	SSO           Source = "sso"
	Impersonation Source = "impersonation"
)

type Model struct {
	ID           string `gorm:"primaryKey;size:43"`
	UserID       uint
	Source       Source `gorm:"size:16"`
	ConnectionID string `gorm:"size:43"`
	LoginEmail   string `gorm:"size:254"`
	ParentID     string `gorm:"size:43"`
	CreatedAt    time.Time
	ExpiresAt    time.Time
	RevokedAt    *time.Time
}

func (Model) TableName() string { return "session" }

type Principal struct {
	Session      Model
	Capabilities []string
}

type RevocationFilter struct{ SessionID, ConnectionID, LoginEmail string }
