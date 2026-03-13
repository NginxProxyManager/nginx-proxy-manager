package models

// Setting stores key-value configuration
type Setting struct {
	ID          string `gorm:"primaryKey;not null" json:"id"`
	Name        string `gorm:"size:100;not null" json:"name"`
	Description string `gorm:"size:255;not null" json:"description"`
	Value       string `gorm:"size:255;not null" json:"value"`
	Meta        string `gorm:"type:text;not null" json:"meta"` // JSON string
}

func (Setting) TableName() string {
	return "setting"
}
