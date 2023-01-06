package host

import "npm/internal/entity/upstream"

// Template is the model given to the template parser, converted from the Model
type Template struct {
	ID                    int
	CreatedOn             string
	ModifiedOn            string
	UserID                int
	Type                  string
	NginxTemplateID       int
	ListenInterface       string
	DomainNames           []string
	UpstreamID            int
	CertificateID         int
	AccessListID          int
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
