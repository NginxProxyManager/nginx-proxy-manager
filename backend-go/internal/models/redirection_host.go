package models

// RedirectionHost represents a redirection configuration
type RedirectionHost struct {
	Base
	OwnerUserID       uint   `gorm:"not null" json:"owner_user_id"`
	IsDeleted         uint   `gorm:"default:0" json:"is_deleted"`
	DomainNames       string `gorm:"type:text;not null" json:"domain_names"` // JSON string array
	ForwardScheme     string `gorm:"not null;default:'$scheme'" json:"forward_scheme"`
	ForwardDomainName string `gorm:"not null" json:"forward_domain_name"`
	ForwardHTTPCode   uint   `gorm:"not null;default:302" json:"forward_http_code"`
	PreservePath      uint   `gorm:"default:0;not null" json:"preserve_path"`
	CertificateID     uint   `gorm:"default:0;not null" json:"certificate_id"`
	SSLForced         uint   `gorm:"default:0;not null" json:"ssl_forced"`
	BlockExploits     uint   `gorm:"default:0;not null" json:"block_exploits"`
	AdvancedConfig    string `gorm:"type:text;not null;default:''" json:"advanced_config"`
	Meta              string `gorm:"type:text;not null" json:"meta"` // JSON string
}

func (RedirectionHost) TableName() string {
	return "redirection_host"
}
