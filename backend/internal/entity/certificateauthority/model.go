package certificateauthority

import (
	"os"
	"path/filepath"

	"npm/internal/database"
	"npm/internal/entity"
	"npm/internal/errors"

	"github.com/rotisserie/eris"
)

// Model is the model
type Model struct {
	entity.ModelBase
	Name                string `json:"name" gorm:"column:name" filter:"name,string"`
	AcmeshServer        string `json:"acmesh_server" gorm:"column:acmesh_server" filter:"acmesh_server,string"`
	CABundle            string `json:"ca_bundle" gorm:"column:ca_bundle" filter:"ca_bundle,string"`
	MaxDomains          int    `json:"max_domains" gorm:"column:max_domains" filter:"max_domains,integer"`
	IsWildcardSupported bool   `json:"is_wildcard_supported" gorm:"column:is_wildcard_supported" filter:"is_wildcard_supported,boolean"`
	IsReadonly          bool   `json:"is_readonly" gorm:"column:is_readonly" filter:"is_readonly,boolean"`
}

// TableName overrides the table name used by gorm
func (Model) TableName() string {
	return "certificate_authority"
}

// LoadByID will load from an ID
func (m *Model) LoadByID(id uint) error {
	db := database.GetDB()
	result := db.First(&m, id)
	return result.Error
}

// Save will save this model to the DB
func (m *Model) Save() error {
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

// Check will ensure the ca bundle path exists if it's set
func (m *Model) Check() error {
	var err error

	if m.CABundle != "" {
		if _, fileerr := os.Stat(filepath.Clean(m.CABundle)); eris.Is(fileerr, os.ErrNotExist) {
			err = errors.ErrCABundleDoesNotExist
		}
	}

	return err
}
