package jwt

import (
	"npm/internal/database"
	"npm/internal/model"
)

var currentKeys KeysModel

// KeysModel is the model
type KeysModel struct {
	model.Base
	PublicKey  string `gorm:"column:public_key"`
	PrivateKey string `gorm:"column:private_key"`
}

// TableName overrides the table name used by gorm
func (KeysModel) TableName() string {
	return "jwt_keys"
}

// LoadLatest will load the latest keys
func (m *KeysModel) LoadLatest() error {
	db := database.GetDB()
	result := db.Order("created_at DESC").First(&m)
	return result.Error
}

// Save will save this model to the DB
func (m *KeysModel) Save() error {
	db := database.GetDB()
	result := db.Save(m)
	return result.Error
}

// LoadKeys will load from the database, or generate and save new ones
func LoadKeys() error {
	// Try to find in db
	if err := currentKeys.LoadLatest(); err != nil {
		// Keys probably don't exist, so we need to generate some
		if currentKeys, err = generateKeys(); err != nil {
			return err
		}

		// and save them
		if err = currentKeys.Save(); err != nil {
			return err
		}
	}

	return nil
}
