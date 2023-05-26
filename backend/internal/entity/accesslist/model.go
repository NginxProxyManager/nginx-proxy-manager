package accesslist

import (
	"npm/internal/database"
	"npm/internal/entity"
	"npm/internal/entity/user"
	"npm/internal/types"

	"github.com/rotisserie/eris"
)

// Model is the model
type Model struct {
	entity.ModelBase
	UserID int         `json:"user_id" gorm:"column:user_id" filter:"user_id,integer"`
	Name   string      `json:"name" gorm:"column:name" filter:"name,string"`
	Meta   types.JSONB `json:"meta" gorm:"column:meta"`
	// Expansions
	User *user.Model `json:"user,omitempty" gorm:"-"`
}

// TableName overrides the table name used by gorm
func (Model) TableName() string {
	return "access_list"
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
