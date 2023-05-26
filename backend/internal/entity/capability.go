package entity

// Capability is the db model
type Capability struct {
	Name string `json:"name" gorm:"column:name;primaryKey" filter:"name,string"`
}

// TableName overrides the table name used by gorm
func (Capability) TableName() string {
	return "capability"
}
