package models

// DeadHost represents a dead host configuration
type DeadHost struct {
	Base
	OwnerUserID    uint   `gorm:"not null" json:"owner_user_id"`
	IsDeleted      uint   `gorm:"default:0" json:"is_deleted"`
	DomainNames    string `gorm:"type:text;not null" json:"domain_names"` // JSON string array
	CertificateID  uint   `gorm:"default:0;not null" json:"certificate_id"`
	SSLForced      uint   `gorm:"default:0;not null" json:"ssl_forced"`
	AdvancedConfig string `gorm:"type:text;not null;default:''" json:"advanced_config"`
	Meta           string `gorm:"type:text;not null" json:"meta"` // JSON string
}

func (DeadHost) TableName() string {
	return "dead_host"
}
