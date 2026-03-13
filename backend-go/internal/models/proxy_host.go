package models

// ProxyHost represents a reverse proxy configuration
type ProxyHost struct {
	Base
	OwnerUserID    uint   `gorm:"not null" json:"owner_user_id"`
	IsDeleted      uint   `gorm:"default:0" json:"is_deleted"`
	DomainNames    string `gorm:"type:text;not null" json:"domain_names"` // Stored as JSON string array
	ForwardIP      string `gorm:"not null" json:"forward_ip"`
	ForwardPort    uint   `gorm:"not null" json:"forward_port"`
	AccessListID   uint   `gorm:"default:0;not null" json:"access_list_id"`
	CertificateID  uint   `gorm:"default:0;not null" json:"certificate_id"`
	SSLForced      uint   `gorm:"default:0;not null" json:"ssl_forced"`
	CachingEnabled uint   `gorm:"default:0;not null" json:"caching_enabled"`
	BlockExploits  uint   `gorm:"default:0;not null" json:"block_exploits"`
	AdvancedConfig string `gorm:"type:text;not null;default:''" json:"advanced_config"`
	Meta           string `gorm:"type:text;not null" json:"meta"` // Stored as JSON string
}

func (ProxyHost) TableName() string {
	return "proxy_host"
}
