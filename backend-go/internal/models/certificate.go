package models

import "time"

// Certificate represents an SSL Certificate
type Certificate struct {
	Base
	OwnerUserID uint      `gorm:"not null" json:"owner_user_id"`
	IsDeleted   uint      `gorm:"default:0" json:"is_deleted"`
	Provider    string    `gorm:"not null" json:"provider"`
	NiceName    string    `gorm:"not null;default:''" json:"nice_name"`
	DomainNames string    `gorm:"type:text;not null" json:"domain_names"` // JSON string array
	ExpiresOn   time.Time `gorm:"not null" json:"expires_on"`
	Meta        string    `gorm:"type:text;not null" json:"meta"` // JSON string
}

func (Certificate) TableName() string {
	return "certificate"
}
