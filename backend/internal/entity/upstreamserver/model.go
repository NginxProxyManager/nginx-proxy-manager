package upstreamserver

import (
	"fmt"
	"time"

	"npm/internal/database"
	"npm/internal/types"
)

const (
	tableName = "upstream_server"
)

// Model is the upstream model
type Model struct {
	ID          int          `json:"id" db:"id" filter:"id,integer"`
	CreatedOn   types.DBDate `json:"created_on" db:"created_on" filter:"created_on,integer"`
	ModifiedOn  types.DBDate `json:"modified_on" db:"modified_on" filter:"modified_on,integer"`
	UpstreamID  int          `json:"upstream_id" db:"upstream_id" filter:"upstream_id,integer"`
	Server      string       `json:"server" db:"server" filter:"server,string"`
	Weight      int          `json:"weight" db:"weight" filter:"weight,integer"`
	MaxConns    int          `json:"max_conns" db:"max_conns" filter:"max_conns,integer"`
	MaxFails    int          `json:"max_fails" db:"max_fails" filter:"max_fails,integer"`
	FailTimeout int          `json:"fail_timeout" db:"fail_timeout" filter:"fail_timeout,integer"`
	Backup      bool         `json:"backup" db:"backup" filter:"backup,boolean"`
	IsDeleted   bool         `json:"is_deleted,omitempty" db:"is_deleted"`
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

	if m.UpstreamID == 0 {
		return fmt.Errorf("Upstream ID must be specified")
	}

	if m.ID == 0 {
		m.ID, err = create(m)
	} else {
		err = update(m)
	}

	return err
}

// Delete will mark a upstream as deleted
func (m *Model) Delete() bool {
	m.Touch(false)
	m.IsDeleted = true
	if err := m.Save(); err != nil {
		return false
	}
	return true
}
