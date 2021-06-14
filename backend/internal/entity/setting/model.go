package setting

import (
	"fmt"
	"strings"
	"time"

	"npm/internal/database"
	"npm/internal/types"
)

const (
	tableName = "setting"
)

// Model is the user model
type Model struct {
	ID         int          `json:"id" db:"id" filter:"id,integer"`
	CreatedOn  types.DBDate `json:"created_on" db:"created_on" filter:"created_on,integer"`
	ModifiedOn types.DBDate `json:"modified_on" db:"modified_on" filter:"modified_on,integer"`
	Name       string       `json:"name" db:"name" filter:"name,string"`
	Value      types.JSONB  `json:"value" db:"value"`
}

func (m *Model) getByQuery(query string, params []interface{}) error {
	return database.GetByQuery(m, query, params)
}

// LoadByID will load from an ID
func (m *Model) LoadByID(id int) error {
	query := fmt.Sprintf("SELECT * FROM `%s` WHERE `id` = ? LIMIT 1", tableName)
	params := []interface{}{id}
	return m.getByQuery(query, params)
}

// LoadByName will load from a Name
func (m *Model) LoadByName(name string) error {
	query := fmt.Sprintf("SELECT * FROM `%s` WHERE LOWER(`name`) = ? LIMIT 1", tableName)
	params := []interface{}{strings.TrimSpace(strings.ToLower(name))}
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

	if m.ID == 0 {
		m.ID, err = Create(m)
	} else {
		err = Update(m)
	}

	// Reapply settings
	if err == nil {
		ApplySettings()
	}

	return err
}
