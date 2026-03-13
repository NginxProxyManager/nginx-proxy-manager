package models

// AccessList represents an access list
type AccessList struct {
	Base
	OwnerUserID uint   `gorm:"not null" json:"owner_user_id"`
	IsDeleted   uint   `gorm:"default:0" json:"is_deleted"`
	Name        string `gorm:"not null" json:"name"`
	Meta        string `gorm:"type:text;not null" json:"meta"` // JSON string

	Clients []AccessListClient `gorm:"foreignKey:AccessListID" json:"clients"`
	Auth    []AccessListAuth   `gorm:"foreignKey:AccessListID" json:"auth"`
}

// AccessListAuth represents basic auth credentials for an access list
type AccessListAuth struct {
	Base
	AccessListID uint   `gorm:"not null" json:"access_list_id"`
	Username     string `gorm:"not null" json:"username"`
	Password     string `gorm:"not null" json:"password"`
	Meta         string `gorm:"type:text;not null" json:"meta"` // JSON string
}

// AccessListClient represents an IP/CIDR client rule for an access list
type AccessListClient struct {
	Base
	AccessListID uint   `gorm:"not null" json:"access_list_id"`
	Address      string `gorm:"not null" json:"address"`
	Directive    string `gorm:"not null" json:"directive"`      // e.g. "allow" or "deny"
	Meta         string `gorm:"type:text;not null" json:"meta"` // JSON string
}

func (AccessList) TableName() string {
	return "access_list"
}

func (AccessListAuth) TableName() string {
	return "access_list_auth"
}

func (AccessListClient) TableName() string {
	return "access_list_client"
}
