package host

// Template is the model given to the template parser, converted from the Model
type Template struct {
	ID                    int
	CreatedOn             string
	ModifiedOn            string
	UserID                int
	Type                  string
	HostTemplateID        int
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
	UpstreamOptions       string
	AdvancedConfig        string
	Status                string
	ErrorMessage          string
}
