package dnsprovider

import (
	"fmt"
	"time"

	"npm/internal/database"
	"npm/internal/dnsproviders"
	"npm/internal/logger"
	"npm/internal/types"
)

const (
	tableName = "dns_provider"
)

// Model is the user model
// Also see: https://github.com/acmesh-official/acme.sh/wiki/dnscheck
type Model struct {
	ID         int          `json:"id" db:"id" filter:"id,integer"`
	CreatedOn  types.DBDate `json:"created_on" db:"created_on" filter:"created_on,integer"`
	ModifiedOn types.DBDate `json:"modified_on" db:"modified_on" filter:"modified_on,integer"`
	UserID     int          `json:"user_id" db:"user_id" filter:"user_id,integer"`
	Name       string       `json:"name" db:"name" filter:"name,string"`
	AcmeshName string       `json:"acmesh_name" db:"acmesh_name" filter:"acmesh_name,string"`
	DNSSleep   int          `json:"dns_sleep" db:"dns_sleep" filter:"dns_sleep,integer"`
	Meta       types.JSONB  `json:"meta" db:"meta"`
	IsDeleted  bool         `json:"is_deleted,omitempty" db:"is_deleted"`
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

// GetAcmeShEnvVars returns the env vars required for acme.sh dns cert requests
func (m *Model) GetAcmeShEnvVars() ([]string, error) {
	logger.Debug("GetAcmeShEnvVars for: %s", m.AcmeshName)
	// First, fetch the provider obj with this AcmeShName
	acmeDNSProvider, err := dnsproviders.Get(m.AcmeshName)
	logger.Debug("acmeDNSProvider: %+v", acmeDNSProvider)
	if err != nil {
		logger.Error("GetAcmeShEnvVarsError", err)
		return nil, err
	}

	// Convert the meta interface to envs slice for use by acme.sh
	envs := getEnvsFromMeta(m.Meta.Decoded)
	return envs, nil
}

func getEnvsFromMeta(meta interface{}) []string {
	if rec, ok := meta.(map[string]interface{}); ok {
		envs := make([]string, 0)
		for key, val := range rec {
			if f, ok := val.(string); ok {
				envs = append(envs, fmt.Sprintf(`%s=%v`, key, f))
			} else if f, ok := val.(int); ok {
				envs = append(envs, fmt.Sprintf(`%s=%d`, key, f))
			}
		}
		return envs
	} else {
		logger.Debug("getEnvsFromMeta: meta is not an map of strings")
		return nil
	}
}
