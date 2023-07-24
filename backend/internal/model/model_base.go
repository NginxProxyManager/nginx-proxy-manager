package model

import (
	"gorm.io/plugin/soft_delete"
)

// ModelBase include common fields for db control
type ModelBase struct {
	ID        uint                  `json:"id" gorm:"column:id;primaryKey" filter:"id,integer"`
	CreatedAt int64                 `json:"created_at" gorm:"<-:create;autoCreateTime:milli;column:created_at" filter:"created_at,date"`
	UpdatedAt int64                 `json:"updated_at" gorm:"<-;autoUpdateTime:milli;column:updated_at" filter:"updated_at,date"`
	DeletedAt soft_delete.DeletedAt `json:"-" gorm:"column:is_deleted;softDelete:flag"`
}
