package host

import (
	"fmt"
	"time"

	"npm/internal/database"
	"npm/internal/types"
)

const (
	tableName = "host"

	// ProxyHostType is self explanatory
	ProxyHostType = "proxy"
	// RedirectionHostType is self explanatory
	RedirectionHostType = "redirection"
	// DeadHostType is self explanatory
	DeadHostType = "dead"
)

// Model is the user model
type Model struct {
	ID                    int          `json:"id" db:"id" filter:"id,integer"`
	CreatedOn             types.DBDate `json:"created_on" db:"created_on" filter:"created_on,integer"`
	ModifiedOn            types.DBDate `json:"modified_on" db:"modified_on" filter:"modified_on,integer"`
	UserID                int          `json:"user_id" db:"user_id" filter:"user_id,integer"`
	Type                  string       `json:"type" db:"type" filter:"type,string"`
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
	IsDisabled            bool         `json:"is_disabled" db:"is_disabled" filter:"is_disabled,boolean"`
	IsDeleted             bool         `json:"is_deleted,omitempty" db:"is_deleted"`
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

	if m.ID == 0 {
		m.ID, err = Create(m)
	} else {
		err = Update(m)
	}

	return err
}

// Delete will mark a host as deleted
func (m *Model) Delete() bool {
	m.Touch(false)
	m.IsDeleted = true
	if err := m.Save(); err != nil {
		return false
	}
	return true
}
