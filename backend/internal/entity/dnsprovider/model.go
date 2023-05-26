package dnsprovider

import (
	"fmt"

	"npm/internal/database"
	"npm/internal/dnsproviders"
	"npm/internal/entity"
	"npm/internal/logger"
	"npm/internal/types"

	"github.com/rotisserie/eris"
)

// Model is the model
type Model struct {
	entity.ModelBase
	UserID     int         `json:"user_id" gorm:"column:user_id" filter:"user_id,integer"`
	Name       string      `json:"name" gorm:"column:name" filter:"name,string"`
	AcmeshName string      `json:"acmesh_name" gorm:"column:acmesh_name" filter:"acmesh_name,string"`
	DNSSleep   int         `json:"dns_sleep" gorm:"column:dns_sleep" filter:"dns_sleep,integer"`
	Meta       types.JSONB `json:"meta" gorm:"column:meta"`
}

// TableName overrides the table name used by gorm
func (Model) TableName() string {
	return "dns_provider"
}

// LoadByID will load from an ID
func (m *Model) LoadByID(id uint) error {
	db := database.GetDB()
	result := db.First(&m, id)
	return result.Error
}

// Save will save this model to the DB
func (m *Model) Save() error {
	if m.UserID == 0 {
		return eris.Errorf("User ID must be specified")
	}

	db := database.GetDB()
	result := db.Save(m)
	return result.Error
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
