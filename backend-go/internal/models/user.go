package models

import (
	"time"
)

// Base contains common columns for all tables
type Base struct {
	ID         uint      `gorm:"primaryKey;autoIncrement" json:"id"`
	CreatedOn  time.Time `gorm:"autoCreateTime" json:"created_on"`
	ModifiedOn time.Time `gorm:"autoUpdateTime" json:"modified_on"`
}

// User represents a user of the system
type User struct {
	Base
	IsDeleted   uint           `gorm:"default:0" json:"is_deleted"`
	IsDisabled  uint           `gorm:"default:0" json:"is_disabled"`
	Email       string         `gorm:"not null" json:"email"`
	Name        string         `gorm:"not null" json:"name"`
	Nickname    string         `gorm:"not null" json:"nickname"`
	Avatar      string         `gorm:"not null" json:"avatar"`
	Roles       string         `gorm:"type:text;not null" json:"roles"` // Stored as JSON string
	Permissions UserPermission `gorm:"foreignKey:UserID" json:"permissions,omitempty"`
}

// UserPermission represents the permissions for a user
type UserPermission struct {
	Base
	UserID           uint   `gorm:"uniqueIndex;not null" json:"user_id"`
	Visibility       string `gorm:"not null" json:"visibility"`
	ProxyHosts       string `gorm:"not null" json:"proxy_hosts"`
	RedirectionHosts string `gorm:"not null" json:"redirection_hosts"`
	DeadHosts        string `gorm:"not null" json:"dead_hosts"`
	Streams          string `gorm:"not null" json:"streams"`
	AccessLists      string `gorm:"not null" json:"access_lists"`
	Certificates     string `gorm:"not null" json:"certificates"`
}

// TableName overrides the table name used by User to `user`
func (User) TableName() string {
	return "user"
}

// TableName overrides the table name used by UserPermission to `user_permission`
func (UserPermission) TableName() string {
	return "user_permission"
}
