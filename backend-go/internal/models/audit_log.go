package models

// AuditLog tracks actions performed by users
type AuditLog struct {
	Base
	UserID     uint   `gorm:"not null" json:"user_id"`
	ObjectType string `gorm:"not null;default:''" json:"object_type"`
	ObjectID   uint   `gorm:"default:0;not null" json:"object_id"`
	Action     string `gorm:"not null" json:"action"`
	Meta       string `gorm:"type:text;not null" json:"meta"` // JSON string
}

func (AuditLog) TableName() string {
	return "audit_log"
}
