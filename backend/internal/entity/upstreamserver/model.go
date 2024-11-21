package upstreamserver

import (
	"npm/internal/database"
	"npm/internal/model"
)

// Model is the model
type Model struct {
	model.Base
	UpstreamID  uint   `json:"upstream_id" gorm:"column:upstream_id" filter:"upstream_id,integer"`
	Server      string `json:"server" gorm:"column:server" filter:"server,string"`
	Weight      int    `json:"weight" gorm:"column:weight" filter:"weight,integer"`
	MaxConns    int    `json:"max_conns" gorm:"column:max_conns" filter:"max_conns,integer"`
	MaxFails    int    `json:"max_fails" gorm:"column:max_fails" filter:"max_fails,integer"`
	FailTimeout int    `json:"fail_timeout" gorm:"column:fail_timeout" filter:"fail_timeout,integer"`
	Backup      bool   `json:"backup" gorm:"column:is_backup" filter:"backup,boolean"`
}

// TableName overrides the table name used by gorm
func (Model) TableName() string {
	return "upstream_server"
}

// LoadByID will load from an ID
func (m *Model) LoadByID(id int) error {
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
