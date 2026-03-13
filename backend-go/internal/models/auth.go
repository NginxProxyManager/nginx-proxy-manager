package models

// Auth represents a user's authentication credentials/secrets
type Auth struct {
	Base
	UserID    uint   `gorm:"not null" json:"user_id"`
	Type      string `gorm:"size:30;not null" json:"type"`
	Secret    string `gorm:"not null" json:"secret"`         // Store hashed password
	Meta      string `gorm:"type:text;not null" json:"meta"` // JSON string
	IsDeleted uint   `gorm:"default:0" json:"is_deleted"`
}

func (Auth) TableName() string {
	return "auth"
}
