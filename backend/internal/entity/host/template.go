package host

import "npm/internal/entity/upstream"

// Template is the model given to the template parser, converted from the Model
type Template struct {
	ID                    uint
	CreatedAt             string
	UpdatedAt             string
	UserID                uint
	Type                  string
	NginxTemplateID       uint
	ProxyScheme           string
	ProxyHost             string
	ProxyPort             int
	ListenInterface       string
	DomainNames           []string
	UpstreamID            uint
	CertificateID         uint
	AccessListID          uint
	SSLForced             bool
	CachingEnabled        bool
	BlockExploits         bool
	AllowWebsocketUpgrade bool
	HTTP2Support          bool
	HSTSEnabled           bool
	HSTSSubdomains        bool
	IsDisabled            bool
	Paths                 string
	AdvancedConfig        string
	Status                string
	ErrorMessage          string
	Upstream              upstream.Model
}
