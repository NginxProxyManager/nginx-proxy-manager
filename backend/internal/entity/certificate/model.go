package certificate

import (
	"fmt"
	"os"
	"regexp"
	"strings"
	"time"

	"npm/internal/acme"
	"npm/internal/config"
	"npm/internal/database"
	"npm/internal/entity/certificateauthority"
	"npm/internal/entity/dnsprovider"
	"npm/internal/entity/user"
	"npm/internal/logger"
	"npm/internal/model"
	"npm/internal/serverevents"
	"npm/internal/types"
	"npm/internal/util"

	"github.com/rotisserie/eris"
)

const (
	// TypeCustom custom cert type
	TypeCustom = "custom"
	// TypeHTTP http cert type
	TypeHTTP = "http"
	// TypeDNS dns cert type
	TypeDNS = "dns"
	// TypeMkcert mkcert cert type
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

// Model is the model
type Model struct {
	model.ModelBase
	UserID                 uint                 `json:"user_id" gorm:"column:user_id" filter:"user_id,integer"`
	Type                   string               `json:"type" gorm:"column:type" filter:"type,string"`
	CertificateAuthorityID types.NullableDBUint `json:"certificate_authority_id" gorm:"column:certificate_authority_id" filter:"certificate_authority_id,integer"`
	DNSProviderID          types.NullableDBUint `json:"dns_provider_id" gorm:"column:dns_provider_id" filter:"dns_provider_id,integer"`
	Name                   string               `json:"name" gorm:"column:name" filter:"name,string"`
	DomainNames            types.JSONB          `json:"domain_names" gorm:"column:domain_names" filter:"domain_names,string"`
	ExpiresOn              int64                `json:"expires_on" gorm:"column:expires_on" filter:"expires_on,integer"`
	Status                 string               `json:"status" gorm:"column:status" filter:"status,string"`
	ErrorMessage           string               `json:"error_message" gorm:"column:error_message" filter:"error_message,string"`
	Meta                   types.JSONB          `json:"-" gorm:"column:meta"`
	IsECC                  bool                 `json:"is_ecc" gorm:"column:is_ecc" filter:"is_ecc,bool"`
	// Expansions:
	CertificateAuthority *certificateauthority.Model `json:"certificate_authority,omitempty" gorm:"-"`
	DNSProvider          *dnsprovider.Model          `json:"dns_provider,omitempty" gorm:"-"`
	User                 *user.Model                 `json:"user,omitempty" gorm:"-"`
}

// TableName overrides the table name used by gorm
func (Model) TableName() string {
	return "certificate"
}

// LoadByID will load from an ID
func (m *Model) LoadByID(id uint) error {
	db := database.GetDB()
	result := db.First(&m, id)
	return result.Error
}

// Save will save this model to the DB
func (m *Model) Save() error {
	if m.UserID == 0 {
		return eris.Errorf("User ID must be specified")
	}

	if !m.Validate() {
		return eris.Errorf("Certificate data is incorrect or incomplete for this type")
	}

	if !m.ValidateWildcardSupport() {
		return eris.Errorf("Cannot use Wildcard domains with this CA")
	}

	m.setDefaultStatus()

	// ensure name is trimmed of whitespace
	m.Name = strings.TrimSpace(m.Name)

	db := database.GetDB()
	result := db.Save(m)
	return result.Error
}

// Delete will mark row as deleted
func (m *Model) Delete() bool {
	if m.ID == 0 {
		// Can't delete a new object
		return false
	}
	db := database.GetDB()
	result := db.Delete(m)
	return result.Error == nil

	// todo: delete from acme.sh as well
}

// Validate will make sure the data given is expected. This object is a bit complicated,
// as there could be multiple combinations of values.
func (m *Model) Validate() bool {
	switch m.Type {
	case TypeCustom:
		// TODO: make sure meta contains required fields
		return m.DNSProviderID.Uint == 0 && m.CertificateAuthorityID.Uint == 0

	case TypeHTTP:
		return m.DNSProviderID.Uint == 0 && m.CertificateAuthorityID.Uint > 0

	case TypeDNS:
		return m.DNSProviderID.Uint > 0 && m.CertificateAuthorityID.Uint > 0

	case TypeMkcert:
		return true

	default:
		return false
	}
}

// ValidateWildcardSupport will ensure that the CA given supports wildcards,
// only if the domains on this object have at least 1 wildcard
func (m *Model) ValidateWildcardSupport() bool {
	domains, err := m.DomainNames.AsStringArray()
	if err != nil {
		logger.Error("ValidateWildcardSupportError", err)
		return false
	}

	hasWildcard := false
	for _, domain := range domains {
		if strings.Contains(domain, "*") {
			hasWildcard = true
		}
	}

	if hasWildcard {
		// nolint: errcheck, gosec
		m.Expand([]string{"certificate-authority", "dns-provider"})
		if !m.CertificateAuthority.IsWildcardSupported {
			return false
		}
	}

	return true
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
func (m *Model) Expand(items []string) error {
	var err error

	if util.SliceContainsItem(items, "certificate-authority") && m.CertificateAuthorityID.Uint > 0 {
		var certificateAuthority certificateauthority.Model
		certificateAuthority, err = certificateauthority.GetByID(m.CertificateAuthorityID.Uint)
		m.CertificateAuthority = &certificateAuthority
	}

	if util.SliceContainsItem(items, "dns-provider") && m.DNSProviderID.Uint > 0 {
		var dnsProvider dnsprovider.Model
		dnsProvider, err = dnsprovider.GetByID(m.DNSProviderID.Uint)
		m.DNSProvider = &dnsProvider
	}

	if util.SliceContainsItem(items, "user") && m.ID > 0 {
		var usr user.Model
		usr, err = user.GetByID(m.UserID)
		m.User = &usr
	}

	return err
}

// GetCertificateLocations will return the paths on disk where the SSL
// certs should or would be.
// Returns: (key, fullchain, certFolder)
func (m *Model) GetCertificateLocations() (string, string, string) {
	if m.ID == 0 {
		logger.Error("GetCertificateLocationsError", eris.New("GetCertificateLocations called before certificate was saved"))
		return "", "", ""
	}

	certFolder := fmt.Sprintf("%s/certificates", config.Configuration.DataFolder)

	// Generate a unique folder name for this cert
	m1 := regexp.MustCompile(`[^A-Za-z0-9\.]`)

	niceName := m1.ReplaceAllString(m.Name, "_")
	if len(niceName) > 20 {
		niceName = niceName[:20]
	}
	folderName := fmt.Sprintf("%d-%s", m.ID, niceName)

	return fmt.Sprintf("%s/%s/key.pem", certFolder, folderName),
		fmt.Sprintf("%s/%s/fullchain.pem", certFolder, folderName),
		fmt.Sprintf("%s/%s", certFolder, folderName)
}

// Request makes a certificate request
func (m *Model) Request() error {
	logger.Info("Requesting certificate for: #%d %v", m.ID, m.Name)
	serverevents.SendChange("certificates")

	// nolint: errcheck, gosec
	m.Expand([]string{"certificate-authority", "dns-provider"})
	m.Status = StatusRequesting
	if err := m.Save(); err != nil {
		logger.Error("CertificateSaveError", err)
		return err
	}

	// do request
	domains, err := m.DomainNames.AsStringArray()
	if err != nil {
		logger.Error("CertificateRequestError", err)
		return err
	}

	certKeyFile, certFullchainFile, certFolder := m.GetCertificateLocations()

	// ensure certFolder is created
	// nolint: gosec
	if err := os.MkdirAll(certFolder, os.ModePerm); err != nil {
		logger.Error("CreateFolderError", err)
		return err
	}

	errMsg, err := acme.RequestCert(domains, m.Type, certFullchainFile, certKeyFile, m.DNSProvider, m.CertificateAuthority, true)
	if err != nil {
		m.Status = StatusFailed
		m.ErrorMessage = errMsg
		if err := m.Save(); err != nil {
			logger.Error("CertificateSaveError", err)
			return err
		}
		return nil
	}

	// If done
	m.Status = StatusProvided
	m.ExpiresOn = time.Now().UnixMilli()
	if err := m.Save(); err != nil {
		logger.Error("CertificateSaveError", err)
		return err
	}

	serverevents.SendChange("certificates")
	logger.Info("Request for certificate for: #%d %v was completed", m.ID, m.Name)
	return nil
}

// GetTemplate will convert the Model to a Template
func (m *Model) GetTemplate() Template {
	if m.ID == 0 {
		// No or empty certificate object, happens when the host has no cert
		return Template{}
	}

	domainNames, _ := m.DomainNames.AsStringArray()

	return Template{
		ID:                     m.ID,
		CreatedAt:              fmt.Sprintf("%d", m.CreatedAt), // todo: nice date string
		UpdatedAt:              fmt.Sprintf("%d", m.UpdatedAt), // todo: nice date string
		ExpiresOn:              util.UnixMilliToNiceFormat(m.ExpiresOn),
		Type:                   m.Type,
		UserID:                 m.UserID,
		CertificateAuthorityID: m.CertificateAuthorityID.Uint,
		DNSProviderID:          m.DNSProviderID.Uint,
		Name:                   m.Name,
		DomainNames:            domainNames,
		Status:                 m.Status,
		IsECC:                  m.IsECC,
		// These are helpers for template generation
		IsCustom:   m.Type == TypeCustom,
		IsAcme:     m.Type != TypeCustom,
		IsProvided: m.ID > 0 && m.Status == StatusProvided,
		Folder:     m.GetFolder(),
	}
}

// GetFolder returns the folder where these certs should exist
func (m *Model) GetFolder() string {
	if m.Type == TypeCustom {
		return fmt.Sprintf("%s/custom_ssl/npm-%d", config.Configuration.DataFolder, m.ID)
	}
	return fmt.Sprintf("%s/npm-%d", config.Configuration.Acmesh.CertHome, m.ID)
}
