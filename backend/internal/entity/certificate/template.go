package certificate

// Template is the model given to the template parser, converted from the Model
type Template struct {
	ID                     int
	CreatedOn              string
	ModifiedOn             string
	ExpiresOn              string
	Type                   string
	UserID                 int
	CertificateAuthorityID int
	DNSProviderID          int
	Name                   string
	DomainNames            []string
	Status                 string
	IsECC                  bool
	// These are helpers for template generation
	IsCustom   bool
	IsAcme     bool // non-custom
	IsProvided bool
	Folder     string
}
