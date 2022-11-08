package host

import (
	"fmt"
	"time"

	"npm/internal/database"
	"npm/internal/entity/certificate"
	"npm/internal/entity/hosttemplate"
	"npm/internal/entity/user"
	"npm/internal/types"
	"npm/internal/util"
)

const (
	tableName = "host"

	// ProxyHostType is self explanatory
	ProxyHostType = "proxy"
	// RedirectionHostType is self explanatory
	RedirectionHostType = "redirection"
	// DeadHostType is self explanatory
	DeadHostType = "dead"
	// StatusReady means a host is ready to configure
	StatusReady = "ready"
	// StatusOK means a host is configured within Nginx
	StatusOK = "ok"
	// StatusError is self explanatory
	StatusError = "error"
)

// Model is the user model
type Model struct {
	ID                    int          `json:"id" db:"id" filter:"id,integer"`
	CreatedOn             types.DBDate `json:"created_on" db:"created_on" filter:"created_on,integer"`
	ModifiedOn            types.DBDate `json:"modified_on" db:"modified_on" filter:"modified_on,integer"`
	UserID                int          `json:"user_id" db:"user_id" filter:"user_id,integer"`
	Type                  string       `json:"type" db:"type" filter:"type,string"`
	HostTemplateID        int          `json:"host_template_id" db:"host_template_id" filter:"host_template_id,integer"`
	ListenInterface       string       `json:"listen_interface" db:"listen_interface" filter:"listen_interface,string"`
	DomainNames           types.JSONB  `json:"domain_names" db:"domain_names" filter:"domain_names,string"`
	UpstreamID            int          `json:"upstream_id" db:"upstream_id" filter:"upstream_id,integer"`
	CertificateID         int          `json:"certificate_id" db:"certificate_id" filter:"certificate_id,integer"`
	AccessListID          int          `json:"access_list_id" db:"access_list_id" filter:"access_list_id,integer"`
	SSLForced             bool         `json:"ssl_forced" db:"ssl_forced" filter:"ssl_forced,boolean"`
	CachingEnabled        bool         `json:"caching_enabled" db:"caching_enabled" filter:"caching_enabled,boolean"`
	BlockExploits         bool         `json:"block_exploits" db:"block_exploits" filter:"block_exploits,boolean"`
	AllowWebsocketUpgrade bool         `json:"allow_websocket_upgrade" db:"allow_websocket_upgrade" filter:"allow_websocket_upgrade,boolean"`
	HTTP2Support          bool         `json:"http2_support" db:"http2_support" filter:"http2_support,boolean"`
	HSTSEnabled           bool         `json:"hsts_enabled" db:"hsts_enabled" filter:"hsts_enabled,boolean"`
	HSTSSubdomains        bool         `json:"hsts_subdomains" db:"hsts_subdomains" filter:"hsts_subdomains,boolean"`
	Paths                 string       `json:"paths" db:"paths" filter:"paths,string"`
	UpstreamOptions       string       `json:"upstream_options" db:"upstream_options" filter:"upstream_options,string"`
	AdvancedConfig        string       `json:"advanced_config" db:"advanced_config" filter:"advanced_config,string"`
	Status                string       `json:"status" db:"status" filter:"status,string"`
	ErrorMessage          string       `json:"error_message" db:"error_message" filter:"error_message,string"`
	IsDisabled            bool         `json:"is_disabled" db:"is_disabled" filter:"is_disabled,boolean"`
	IsDeleted             bool         `json:"is_deleted,omitempty" db:"is_deleted"`
	// Expansions
	Certificate  *certificate.Model  `json:"certificate,omitempty"`
	HostTemplate *hosttemplate.Model `json:"host_template,omitempty"`
	User         *user.Model         `json:"user,omitempty"`
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
func (m *Model) Save(skipConfiguration bool) error {
	var err error

	if m.UserID == 0 {
		return fmt.Errorf("User ID must be specified")
	}

	if !skipConfiguration {
		// Set this host as requiring reconfiguration
		m.Status = StatusReady
	}

	if m.ID == 0 {
		m.ID, err = create(m)
	} else {
		err = update(m)
	}

	return err
}

// Delete will mark a host as deleted
func (m *Model) Delete() bool {
	m.Touch(false)
	m.IsDeleted = true
	if err := m.Save(false); err != nil {
		return false
	}
	return true
}

// Expand will fill in more properties
func (m *Model) Expand(items []string) error {
	var err error

	if util.SliceContainsItem(items, "user") && m.ID > 0 {
		var usr user.Model
		usr, err = user.GetByID(m.UserID)
		m.User = &usr
	}

	if util.SliceContainsItem(items, "certificate") && m.CertificateID > 0 {
		var cert certificate.Model
		cert, err = certificate.GetByID(m.CertificateID)
		m.Certificate = &cert
	}

	if util.SliceContainsItem(items, "hosttemplate") && m.HostTemplateID > 0 {
		var templ hosttemplate.Model
		templ, err = hosttemplate.GetByID(m.HostTemplateID)
		m.HostTemplate = &templ
	}

	return err
}

// GetTemplate will convert the Model to a Template
func (m *Model) GetTemplate() Template {
	domainNames, _ := m.DomainNames.AsStringArray()

	t := Template{
		ID:                    m.ID,
		CreatedOn:             m.CreatedOn.Time.String(),
		ModifiedOn:            m.ModifiedOn.Time.String(),
		UserID:                m.UserID,
		Type:                  m.Type,
		HostTemplateID:        m.HostTemplateID,
		ListenInterface:       m.ListenInterface,
		DomainNames:           domainNames,
		UpstreamID:            m.UpstreamID,
		CertificateID:         m.CertificateID,
		AccessListID:          m.AccessListID,
		SSLForced:             m.SSLForced,
		CachingEnabled:        m.CachingEnabled,
		BlockExploits:         m.BlockExploits,
		AllowWebsocketUpgrade: m.AllowWebsocketUpgrade,
		HTTP2Support:          m.HTTP2Support,
		HSTSEnabled:           m.HSTSEnabled,
		HSTSSubdomains:        m.HSTSSubdomains,
		Paths:                 m.Paths,
		UpstreamOptions:       m.UpstreamOptions,
		AdvancedConfig:        m.AdvancedConfig,
		Status:                m.Status,
		ErrorMessage:          m.ErrorMessage,
		IsDisabled:            m.IsDisabled,
	}

	return t
}
