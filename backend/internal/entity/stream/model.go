package stream

import (
	"npm/internal/database"
	"npm/internal/model"
	"npm/internal/types"

	"github.com/rotisserie/eris"
)

// Model is the model
type Model struct {
	model.ModelBase
	ExpiresOn   types.DBDate `json:"expires_on" gorm:"column:expires_on" filter:"expires_on,integer"`
	UserID      uint         `json:"user_id" gorm:"column:user_id" filter:"user_id,integer"`
	Provider    string       `json:"provider" gorm:"column:provider" filter:"provider,string"`
	Name        string       `json:"name" gorm:"column:name" filter:"name,string"`
	DomainNames types.JSONB  `json:"domain_names" gorm:"column:domain_names" filter:"domain_names,string"`
	Meta        types.JSONB  `json:"-" gorm:"column:meta"`
}

// TableName overrides the table name used by gorm
func (Model) TableName() string {
	return "stream"
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
