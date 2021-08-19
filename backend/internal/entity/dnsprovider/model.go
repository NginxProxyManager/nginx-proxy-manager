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
	ID         int          `json:"id" db:"id" filter:"id,integer"`
	CreatedOn  types.DBDate `json:"created_on" db:"created_on" filter:"created_on,integer"`
	ModifiedOn types.DBDate `json:"modified_on" db:"modified_on" filter:"modified_on,integer"`
	UserID     int          `json:"user_id" db:"user_id" filter:"user_id,integer"`
	Name       string       `json:"name" db:"name" filter:"name,string"`
	AcmeShName string       `json:"acme_sh_name" db:"acme_sh_name" filter:"acme_sh_name,string"`
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
	envs := make([]string, 0)
	switch m.AcmeShName {

	// AWS
	case "dns_aws":
		envs = []string{
			"AWS_ACCESS_KEY_ID=\"sdfsdfsdfljlbjkljlkjsdfoiwje\"",
			"AWS_SECRET_ACCESS_KEY=\"xxxxxxx\"",
		}

	// Cloudflare
	case "dns_cf":
		envs = []string{
			"CF_Key=\"sdfsdfsdfljlbjkljlkjsdfoiwje\"",
			"CF_Email=\"xxxx@sss.com\"",
			"CF_Token=\"xxxx\"",
			"CF_Account_ID=\"xxxx\"",
			"CF_Zone_ID=\"xxxx\"",
		}

	// DuckDNS
	case "dns_duckdns":
		envs = []string{
			"DuckDNS_Token=\"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee\"",
		}

	// Njalla
	case "dns_njalla":
		envs = []string{
			"NJALLA_Token=\"sdfsdfsdfljlbjkljlkjsdfoiwje\"",
		}
	}

	return envs, nil
}
