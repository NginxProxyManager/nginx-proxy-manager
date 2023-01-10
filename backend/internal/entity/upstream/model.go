package upstream

import (
	"fmt"
	"strings"
	"time"

	"npm/internal/database"
	"npm/internal/entity/nginxtemplate"
	"npm/internal/entity/upstreamserver"
	"npm/internal/entity/user"
	"npm/internal/status"
	"npm/internal/types"
	"npm/internal/util"
)

const (
	tableName = "upstream"
)

// Model is the Upstream model
// See: http://nginx.org/en/docs/http/ngx_http_upstream_module.html#upstream
type Model struct {
	ID                int          `json:"id" db:"id" filter:"id,integer"`
	CreatedOn         types.DBDate `json:"created_on" db:"created_on" filter:"created_on,integer"`
	ModifiedOn        types.DBDate `json:"modified_on" db:"modified_on" filter:"modified_on,integer"`
	UserID            int          `json:"user_id" db:"user_id" filter:"user_id,integer"`
	Name              string       `json:"name" db:"name" filter:"name,string"`
	NginxTemplateID   int          `json:"nginx_template_id" db:"nginx_template_id" filter:"nginx_template_id,integer"`
	IPHash            bool         `json:"ip_hash" db:"ip_hash" filter:"ip_hash,boolean"`
	NTLM              bool         `json:"ntlm" db:"ntlm" filter:"ntlm,boolean"`
	Keepalive         int          `json:"keepalive" db:"keepalive" filter:"keepalive,integer"`
	KeepaliveRequests int          `json:"keepalive_requests" db:"keepalive_requests" filter:"keepalive_requests,integer"`
	KeepaliveTime     string       `json:"keepalive_time" db:"keepalive_time" filter:"keepalive_time,string"`
	KeepaliveTimeout  string       `json:"keepalive_timeout" db:"keepalive_timeout" filter:"keepalive_timeout,string"`
	AdvancedConfig    string       `json:"advanced_config" db:"advanced_config" filter:"advanced_config,string"`
	Status            string       `json:"status" db:"status" filter:"status,string"`
	ErrorMessage      string       `json:"error_message" db:"error_message" filter:"error_message,string"`
	IsDeleted         bool         `json:"is_deleted,omitempty" db:"is_deleted"`
	// Expansions
	Servers       []upstreamserver.Model `json:"servers"`
	NginxTemplate *nginxtemplate.Model   `json:"nginx_template,omitempty"`
	User          *user.Model            `json:"user,omitempty"`
}

func (m *Model) getByQuery(query string, params []interface{}) error {
	return database.GetByQuery(m, query, params)
}

// LoadByID will load from an ID
func (m *Model) LoadByID(id int) error {
	query := fmt.Sprintf("SELECT * FROM `%s` WHERE id = ? AND is_deleted = ? LIMIT 1", tableName)
	params := []interface{}{id, 0}
	err := m.getByQuery(query, params)
	if err == nil {
		err = m.Expand(nil)
	}
	return err
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

	// ensure name is trimmed of whitespace
	m.Name = strings.TrimSpace(m.Name)

	if !skipConfiguration {
		// Set this upstream as requiring reconfiguration
		m.Status = status.StatusReady
	}

	if m.ID == 0 {
		m.ID, err = create(m)
	} else {
		err = update(m)
	}

	// Save Servers
	if err == nil {
		for idx := range m.Servers {
			// Continue if previous iteration didn't cause an error
			if err == nil {
				m.Servers[idx].UpstreamID = m.ID
				err = m.Servers[idx].Save()
			}
		}
	}

	return err
}

// Delete will mark a upstream as deleted
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
