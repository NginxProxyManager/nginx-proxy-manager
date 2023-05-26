package setting

import (
	"strings"

	"npm/internal/database"
	"npm/internal/entity"

	"gorm.io/datatypes"
)

// Model is the model
type Model struct {
	entity.ModelBase
	Name        string         `json:"name" gorm:"column:name" filter:"name,string"`
	Description string         `json:"description" gorm:"column:description" filter:"description,string"`
	Value       datatypes.JSON `json:"value" gorm:"column:value"`
}

// TableName overrides the table name used by gorm
func (Model) TableName() string {
	return "setting"
}

// LoadByID will load from an ID
func (m *Model) LoadByID(id int) error {
	db := database.GetDB()
	result := db.First(&m, id)
	return result.Error
}

// LoadByName will load from a Name
func (m *Model) LoadByName(name string) error {
	db := database.GetDB()
	result := db.Where("name = ?", strings.ToLower(name)).First(&m)
	return result.Error
}

// Save will save this model to the DB
func (m *Model) Save() error {
	// ensure name is trimmed of whitespace
	m.Name = strings.TrimSpace(m.Name)

	db := database.GetDB()
	if result := db.Save(m); result.Error != nil {
		return result.Error
	}
	ApplySettings()
	return nil
}
