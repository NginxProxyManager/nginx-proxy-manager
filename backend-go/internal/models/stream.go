package models

// Stream represents a stream forwarding configuration
type Stream struct {
	Base
	OwnerUserID    uint   `gorm:"not null" json:"owner_user_id"`
	IsDeleted      uint   `gorm:"default:0" json:"is_deleted"`
	IncomingPort   uint   `gorm:"not null" json:"incoming_port"`
	ForwardIP      string `gorm:"not null" json:"forward_ip"`
	ForwardingPort uint   `gorm:"not null" json:"forwarding_port"`
	TCPForwarding  uint   `gorm:"default:0;not null" json:"tcp_forwarding"`
	UDPForwarding  uint   `gorm:"default:0;not null" json:"udp_forwarding"`
	CertificateID  uint   `gorm:"default:0;not null" json:"certificate_id"` // Added via 20240427161436_stream_ssl.js
	Meta           string `gorm:"type:text;not null" json:"meta"`           // JSON string
}

func (Stream) TableName() string {
	return "stream"
}
