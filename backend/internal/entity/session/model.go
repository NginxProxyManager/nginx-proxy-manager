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
	ID           string     `gorm:"column:id;primaryKey;size:43"`
	UserID       uint       `gorm:"column:user_id"`
	Source       Source     `gorm:"column:source;size:16"`
	ConnectionID string     `gorm:"column:connection_id;size:43"`
	LoginEmail   string     `gorm:"column:login_email;size:254"`
	ParentID     string     `gorm:"column:parent_id;size:43"`
	CreatedAt    time.Time  `gorm:"column:created_at;type:timestamp;serializer:session_timestamp"`
	ExpiresAt    time.Time  `gorm:"column:expires_at;type:timestamp;serializer:session_timestamp"`
	RevokedAt    *time.Time `gorm:"column:revoked_at;type:timestamp;serializer:session_timestamp"`
}

func (Model) TableName() string { return "session" }

type Principal struct {
	Session      Model
	Capabilities []string
}

type RevocationFilter struct{ SessionID, ConnectionID, LoginEmail string }
