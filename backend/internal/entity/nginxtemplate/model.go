package nginxtemplate

import (
	"npm/internal/database"
	"npm/internal/model"

	"github.com/rotisserie/eris"
)

// Model is the model
type Model struct {
	model.Base
	UserID   uint   `json:"user_id" gorm:"column:user_id" filter:"user_id,integer"`
	Name     string `json:"name" gorm:"column:name" filter:"name,string"`
	Type     string `json:"type" gorm:"column:type" filter:"type,string"`
	Template string `json:"template" gorm:"column:template" filter:"template,string"`
}

// TableName overrides the table name used by gorm
func (Model) TableName() string {
	return "nginx_template"
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
