package dnsprovider

import (
	"fmt"

	"npm/internal/database"
	"npm/internal/dnsproviders"
	"npm/internal/logger"
	"npm/internal/model"
	"npm/internal/types"

	"github.com/rotisserie/eris"
)

// Model is the model
type Model struct {
	model.Base
	UserID     uint        `json:"user_id" gorm:"column:user_id" filter:"user_id,integer"`
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

// GetAcmeShEnvVars returns the env vars required for acme.sh dns cert requests
func (m *Model) GetAcmeShEnvVars() ([]string, error) {
	// First, fetch the provider obj with this AcmeShName
	_, err := dnsproviders.Get(m.AcmeshName)
	if err != nil {
		logger.Error("GetAcmeShEnvVarsError", err)
		return nil, err
	}

	// Convert the meta interface to envs slice for use by acme.sh
	envs := getEnvsFromMeta(m.Meta.Decoded)
	return envs, nil
}

func getEnvsFromMeta(meta any) []string {
	if rec, ok := meta.(map[string]any); ok {
		envs := make([]string, 0)
		for key, val := range rec {
			if f, ok := val.(string); ok {
				envs = append(envs, fmt.Sprintf(`%s=%v`, key, f))
			} else if f, ok := val.(int); ok {
				envs = append(envs, fmt.Sprintf(`%s=%d`, key, f))
			}
		}
		return envs
	}

	logger.Debug("getEnvsFromMeta: meta is not an map of strings")
	return nil
}
