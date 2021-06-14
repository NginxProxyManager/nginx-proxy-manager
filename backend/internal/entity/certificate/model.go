package certificate

import (
	"fmt"
	"time"

	"npm/internal/database"
	"npm/internal/entity/certificateauthority"
	"npm/internal/entity/dnsprovider"
	"npm/internal/types"
)

const (
	tableName = "certificate"

	// TypeCustom ...
	TypeCustom = "custom"
	// TypeHTTP ...
	TypeHTTP = "http"
	// TypeDNS ...
	TypeDNS = "dns"
	// TypeMkcert ...
	TypeMkcert = "mkcert"
	// StatusReady is ready for certificate to be requested
	StatusReady = "ready"
	// StatusRequesting is process of being requested
	StatusRequesting = "requesting"
	// StatusFailed is a certicifate that failed to request
	StatusFailed = "failed"
	// StatusProvided is a certificate provided and ready for actual use
	StatusProvided = "provided"
)

// Model is the user model
type Model struct {
	ID                     int                  `json:"id" db:"id" filter:"id,integer"`
	CreatedOn              types.DBDate         `json:"created_on" db:"created_on" filter:"created_on,integer"`
	ModifiedOn             types.DBDate         `json:"modified_on" db:"modified_on" filter:"modified_on,integer"`
	ExpiresOn              types.NullableDBDate `json:"expires_on" db:"expires_on" filter:"expires_on,integer"`
	Type                   string               `json:"type" db:"type" filter:"type,string"`
	UserID                 int                  `json:"user_id" db:"user_id" filter:"user_id,integer"`
	CertificateAuthorityID int                  `json:"certificate_authority_id" db:"certificate_authority_id" filter:"certificate_authority_id,integer"`
	DNSProviderID          int                  `json:"dns_provider_id" db:"dns_provider_id" filter:"dns_provider_id,integer"`
	Name                   string               `json:"name" db:"name" filter:"name,string"`
	DomainNames            types.JSONB          `json:"domain_names" db:"domain_names" filter:"domain_names,string"`
	Status                 string               `json:"status" db:"status" filter:"status,string"`
	ErrorMessage           string               `json:"error_message,omitempty" db:"error_message" filter:"error_message,string"`
	Meta                   types.JSONB          `json:"-" db:"meta"`
	IsDeleted              bool                 `json:"is_deleted,omitempty" db:"is_deleted"`
	// Expansions:
	CertificateAuthority *certificateauthority.Model `json:"certificate_authority,omitempty"`
	DNSProvider          *dnsprovider.Model          `json:"dns_provider,omitempty"`
}

func (m *Model) getByQuery(query string, params []interface{}) error {
	return database.GetByQuery(m, query, params)
}

// LoadByID will load from an ID
func (m *Model) LoadByID(id int) error {
	query := fmt.Sprintf("SELECT * FROM `%s` WHERE id = ? AND is_deleted = ? LIMIT 1", tableName)
	params := []interface{}{id, 0}
	return m.getByQuery(query, params)
}

// Touch will update model's timestamp(s)
func (m *Model) Touch(created bool) {
	var d types.DBDate
	d.Time = time.Now()
	if created {
		m.CreatedOn = d
	}
	m.ModifiedOn = d
}

// Save will save this model to the DB
func (m *Model) Save() error {
	var err error

	if m.UserID == 0 {
		return fmt.Errorf("User ID must be specified")
	}

	if !m.Validate() {
		return fmt.Errorf("Certificate data is incorrect or incomplete for this type")
	}

	m.setDefaultStatus()

	if m.ID == 0 {
		m.ID, err = Create(m)
	} else {
		err = Update(m)
	}

	return err
}

// Delete will mark a certificate as deleted
func (m *Model) Delete() bool {
	m.Touch(false)
	m.IsDeleted = true
	if err := m.Save(); err != nil {
		return false
	}
	return true
}

// Validate will make sure the data given is expected. This object is a bit complicated,
// as there could be multiple combinations of values.
func (m *Model) Validate() bool {
	switch m.Type {
	case TypeCustom:
		// TODO: make sure meta contains required fields
		return m.DNSProviderID == 0 && m.CertificateAuthorityID == 0

	case TypeHTTP:
		return m.DNSProviderID == 0 && m.CertificateAuthorityID > 0

	case TypeDNS:
		return m.DNSProviderID > 0 && m.CertificateAuthorityID > 0

	case TypeMkcert:
		return true

	default:
		return false
	}
}

func (m *Model) setDefaultStatus() {
	if m.ID == 0 {
		// It's a new certificate
		if m.Type == TypeCustom {
			m.Status = StatusProvided
		} else {
			m.Status = StatusReady
		}
	}
}

// Expand will populate attached objects for the model
func (m *Model) Expand() {
	if m.CertificateAuthorityID > 0 {
		certificateAuthority, _ := certificateauthority.GetByID(m.CertificateAuthorityID)
		m.CertificateAuthority = &certificateAuthority
	}
	if m.DNSProviderID > 0 {
		dnsProvider, _ := dnsprovider.GetByID(m.DNSProviderID)
		m.DNSProvider = &dnsProvider
	}
}

// Request ...
func (m *Model) Request() error {
	m.Expand()
	m.Status = StatusRequesting
	if err := m.Save(); err != nil {
		return err
	}

	// If error
	m.Status = StatusFailed
	m.ErrorMessage = "something"
	if err := m.Save(); err != nil {
		return err
	}

	// If done
	m.Status = StatusProvided
	t := time.Now()
	m.ExpiresOn.Time = &t
	if err := m.Save(); err != nil {
		return err
	}

	return nil
}
