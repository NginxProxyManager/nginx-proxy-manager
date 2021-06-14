package dnsprovider

import (
	"fmt"
	"time"

	"npm/internal/database"
	"npm/internal/types"
)

const (
	tableName = "dns_provider"
)

// Model is the user model
type Model struct {
	ID          int          `json:"id" db:"id" filter:"id,integer"`
	CreatedOn   types.DBDate `json:"created_on" db:"created_on" filter:"created_on,integer"`
	ModifiedOn  types.DBDate `json:"modified_on" db:"modified_on" filter:"modified_on,integer"`
	UserID      int          `json:"user_id" db:"user_id" filter:"user_id,integer"`
	ProviderKey string       `json:"provider_key" db:"provider_key" filter:"provider_key,string"`
	Name        string       `json:"name" db:"name" filter:"name,string"`
	Meta        types.JSONB  `json:"meta" db:"meta"`
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

// Delete will mark a certificate as deleted
func (m *Model) Delete() bool {
	m.Touch(false)
	m.IsDeleted = true
	if err := m.Save(); err != nil {
		return false
	}
	return true
}
