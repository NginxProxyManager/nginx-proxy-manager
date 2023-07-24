package upstream

import (
	"strings"

	"npm/internal/database"
	"npm/internal/entity/nginxtemplate"
	"npm/internal/entity/upstreamserver"
	"npm/internal/entity/user"
	"npm/internal/model"
	"npm/internal/status"
	"npm/internal/util"

	"github.com/rotisserie/eris"
)

// Model is the model
// See: http://nginx.org/en/docs/http/ngx_http_upstream_module.html#upstream
type Model struct {
	model.ModelBase
	UserID            uint   `json:"user_id" gorm:"column:user_id" filter:"user_id,integer"`
	Name              string `json:"name" gorm:"column:name" filter:"name,string"`
	NginxTemplateID   uint   `json:"nginx_template_id" gorm:"column:nginx_template_id" filter:"nginx_template_id,integer"`
	IPHash            bool   `json:"ip_hash" gorm:"column:ip_hash" filter:"ip_hash,boolean"`
	NTLM              bool   `json:"ntlm" gorm:"column:ntlm" filter:"ntlm,boolean"`
	Keepalive         int    `json:"keepalive" gorm:"column:keepalive" filter:"keepalive,integer"`
	KeepaliveRequests int    `json:"keepalive_requests" gorm:"column:keepalive_requests" filter:"keepalive_requests,integer"`
	KeepaliveTime     string `json:"keepalive_time" gorm:"column:keepalive_time" filter:"keepalive_time,string"`
	KeepaliveTimeout  string `json:"keepalive_timeout" gorm:"column:keepalive_timeout" filter:"keepalive_timeout,string"`
	AdvancedConfig    string `json:"advanced_config" gorm:"column:advanced_config" filter:"advanced_config,string"`
	Status            string `json:"status" gorm:"column:status" filter:"status,string"`
	ErrorMessage      string `json:"error_message" gorm:"column:error_message" filter:"error_message,string"`
	// Expansions
	Servers       []upstreamserver.Model `json:"servers" gorm:"-"`
	NginxTemplate *nginxtemplate.Model   `json:"nginx_template,omitempty" gorm:"-"`
	User          *user.Model            `json:"user,omitempty" gorm:"-"`
}

// TableName overrides the table name used by gorm
func (Model) TableName() string {
	return "upstream"
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

	// ensure name is trimmed of whitespace
	m.Name = strings.TrimSpace(m.Name)

	if !skipConfiguration {
		// Set this upstream as requiring reconfiguration
		m.Status = status.StatusReady
	}

	db := database.GetDB()
	if result := db.Save(m); result.Error != nil {
		return result.Error
	}

	// Save Servers
	var err error
	for idx := range m.Servers {
		// Continue if previous iteration didn't cause an error
		if err == nil {
			m.Servers[idx].UpstreamID = m.ID
			err = m.Servers[idx].Save()
		}
	}

	return err
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
}

// Expand will fill in more properties
func (m *Model) Expand(items []string) error {
	var err error

	// Always expand servers, if not done already
	if len(m.Servers) == 0 {
		m.Servers, err = upstreamserver.GetByUpstreamID(m.ID)
	}

	if util.SliceContainsItem(items, "user") && m.ID > 0 {
		var usr user.Model
		usr, err = user.GetByID(m.UserID)
		m.User = &usr
	}

	if util.SliceContainsItem(items, "nginxtemplate") && m.NginxTemplateID > 0 {
		var templ nginxtemplate.Model
		templ, err = nginxtemplate.GetByID(m.NginxTemplateID)
		m.NginxTemplate = &templ
	}

	return err
}
