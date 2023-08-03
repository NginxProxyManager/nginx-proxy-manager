package host

import (
	"time"

	"npm/internal/database"
	"npm/internal/entity/certificate"
	"npm/internal/entity/nginxtemplate"
	"npm/internal/entity/upstream"
	"npm/internal/entity/user"
	"npm/internal/model"
	"npm/internal/status"
	"npm/internal/types"
	"npm/internal/util"

	"github.com/rotisserie/eris"
)

const (
	// ProxyHostType is self explanatory
	ProxyHostType = "proxy"
	// RedirectionHostType is self explanatory
	RedirectionHostType = "redirection"
	// DeadHostType is self explanatory
	DeadHostType = "dead"
)

// Model is the model
type Model struct {
	model.ModelBase
	UserID                uint                 `json:"user_id" gorm:"column:user_id" filter:"user_id,integer"`
	Type                  string               `json:"type" gorm:"column:type" filter:"type,string"`
	NginxTemplateID       uint                 `json:"nginx_template_id" gorm:"column:nginx_template_id" filter:"nginx_template_id,integer"`
	ListenInterface       string               `json:"listen_interface" gorm:"column:listen_interface" filter:"listen_interface,string"`
	DomainNames           types.JSONB          `json:"domain_names" gorm:"column:domain_names" filter:"domain_names,string"`
	UpstreamID            types.NullableDBUint `json:"upstream_id" gorm:"column:upstream_id" filter:"upstream_id,integer"`
	ProxyScheme           string               `json:"proxy_scheme" gorm:"column:proxy_scheme" filter:"proxy_scheme,string"`
	ProxyHost             string               `json:"proxy_host" gorm:"column:proxy_host" filter:"proxy_host,string"`
	ProxyPort             int                  `json:"proxy_port" gorm:"column:proxy_port" filter:"proxy_port,integer"`
	CertificateID         types.NullableDBUint `json:"certificate_id" gorm:"column:certificate_id" filter:"certificate_id,integer"`
	AccessListID          types.NullableDBUint `json:"access_list_id" gorm:"column:access_list_id" filter:"access_list_id,integer"`
	SSLForced             bool                 `json:"ssl_forced" gorm:"column:ssl_forced" filter:"ssl_forced,boolean"`
	CachingEnabled        bool                 `json:"caching_enabled" gorm:"column:caching_enabled" filter:"caching_enabled,boolean"`
	BlockExploits         bool                 `json:"block_exploits" gorm:"column:block_exploits" filter:"block_exploits,boolean"`
	AllowWebsocketUpgrade bool                 `json:"allow_websocket_upgrade" gorm:"column:allow_websocket_upgrade" filter:"allow_websocket_upgrade,boolean"`
	HTTP2Support          bool                 `json:"http2_support" gorm:"column:http2_support" filter:"http2_support,boolean"`
	HSTSEnabled           bool                 `json:"hsts_enabled" gorm:"column:hsts_enabled" filter:"hsts_enabled,boolean"`
	HSTSSubdomains        bool                 `json:"hsts_subdomains" gorm:"column:hsts_subdomains" filter:"hsts_subdomains,boolean"`
	Paths                 string               `json:"paths" gorm:"column:paths" filter:"paths,string"`
	AdvancedConfig        string               `json:"advanced_config" gorm:"column:advanced_config" filter:"advanced_config,string"`
	Status                string               `json:"status" gorm:"column:status" filter:"status,string"`
	ErrorMessage          string               `json:"error_message" gorm:"column:error_message" filter:"error_message,string"`
	IsDisabled            bool                 `json:"is_disabled" gorm:"column:is_disabled" filter:"is_disabled,boolean"`
	// Expansions
	Certificate   *certificate.Model   `json:"certificate,omitempty" gorm:"-"`
	NginxTemplate *nginxtemplate.Model `json:"nginx_template,omitempty" gorm:"-"`
	User          *user.Model          `json:"user,omitempty" gorm:"-"`
	Upstream      *upstream.Model      `json:"upstream,omitempty" gorm:"-"`
}

// TableName overrides the table name used by gorm
func (Model) TableName() string {
	return "host"
}

// LoadByID will load from an ID
func (m *Model) LoadByID(id uint) error {
	db := database.GetDB()
	result := db.First(&m, id)
	return result.Error
}

// Save will save this model to the DB
func (m *Model) Save(skipConfiguration bool) error {
	if m.UserID == 0 {
		return eris.Errorf("User ID must be specified")
	}

	if !skipConfiguration {
		// Set this host as requiring reconfiguration
		m.Status = status.StatusReady
	}

	db := database.GetDB()
	result := db.Save(m)
	return result.Error
}

// Delete will mark a row as deleted
func (m *Model) Delete() error {
	if m.ID == 0 {
		// Can't delete a new object
		return eris.New("Unable to delete a new object")
	}
	db := database.GetDB()
	result := db.Delete(m)
	return result.Error
}

// Expand will fill in more properties
func (m *Model) Expand(items []string) error {
	var err error

	// Always expand the upstream
	if m.UpstreamID.Uint > 0 {
		var u upstream.Model
		u, err = upstream.GetByID(m.UpstreamID.Uint)
		m.Upstream = &u
	}

	if util.SliceContainsItem(items, "user") && m.ID > 0 {
		var usr user.Model
		usr, err = user.GetByID(m.UserID)
		m.User = &usr
	}

	if util.SliceContainsItem(items, "certificate") && m.CertificateID.Uint > 0 {
		var cert certificate.Model
		cert, err = certificate.GetByID(m.CertificateID.Uint)
		m.Certificate = &cert
	}

	if util.SliceContainsItem(items, "nginxtemplate") && m.NginxTemplateID > 0 {
		var templ nginxtemplate.Model
		templ, err = nginxtemplate.GetByID(m.NginxTemplateID)
		m.NginxTemplate = &templ
	}

	if util.SliceContainsItem(items, "upstream") && m.UpstreamID.Uint > 0 {
		var ups upstream.Model
		ups, err = upstream.GetByID(m.UpstreamID.Uint)
		m.Upstream = &ups
	}

	return err
}

// GetTemplate will convert the Model to a Template
func (m *Model) GetTemplate() Template {
	domainNames, _ := m.DomainNames.AsStringArray()

	t := Template{
		ID:                    m.ID,
		CreatedAt:             time.UnixMilli(m.CreatedAt).Format(time.RFC1123),
		UpdatedAt:             time.UnixMilli(m.UpdatedAt).Format(time.RFC1123),
		UserID:                m.UserID,
		Type:                  m.Type,
		NginxTemplateID:       m.NginxTemplateID,
		ProxyScheme:           m.ProxyScheme,
		ProxyHost:             m.ProxyHost,
		ProxyPort:             m.ProxyPort,
		ListenInterface:       m.ListenInterface,
		DomainNames:           domainNames,
		UpstreamID:            m.UpstreamID.Uint,
		CertificateID:         m.CertificateID.Uint,
		AccessListID:          m.AccessListID.Uint,
		SSLForced:             m.SSLForced,
		CachingEnabled:        m.CachingEnabled,
		BlockExploits:         m.BlockExploits,
		AllowWebsocketUpgrade: m.AllowWebsocketUpgrade,
		HTTP2Support:          m.HTTP2Support,
		HSTSEnabled:           m.HSTSEnabled,
		HSTSSubdomains:        m.HSTSSubdomains,
		Paths:                 m.Paths,
		AdvancedConfig:        m.AdvancedConfig,
		Status:                m.Status,
		ErrorMessage:          m.ErrorMessage,
		IsDisabled:            m.IsDisabled,
	}

	return t
}
