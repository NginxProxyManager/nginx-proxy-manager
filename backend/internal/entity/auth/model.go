package auth

import (
	"npm/internal/database"
	"npm/internal/model"

	"github.com/rotisserie/eris"
	"golang.org/x/crypto/bcrypt"
)

// Auth types
const (
	TypeLocal = "local"
	TypeLDAP  = "ldap"
	TypeOIDC  = "oidc"
)

// Model is the model
type Model struct {
	model.ModelBase
	UserID   uint   `json:"user_id" gorm:"column:user_id"`
	Type     string `json:"type" gorm:"column:type;default:local"`
	Identity string `json:"identity,omitempty" gorm:"column:identity"`
	Secret   string `json:"secret,omitempty" gorm:"column:secret"`
}

// TableName overrides the table name used by gorm
func (Model) TableName() string {
	return "auth"
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
	// todo: touch? not sure that save does this or not?
	result := db.Save(m)
	return result.Error
}

// SetPassword will generate a hashed password based on given string
func (m *Model) SetPassword(password string) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.MinCost+2)
	if err != nil {
		return err
	}

	m.Type = TypeLocal
	m.Secret = string(hash)

	return nil
}

// ValidateSecret will check if a given secret matches the encrypted secret
func (m *Model) ValidateSecret(secret string) error {
	if m.Type != TypeLocal {
		return eris.New("Could not validate Secret, auth type is not Local")
	}

	err := bcrypt.CompareHashAndPassword([]byte(m.Secret), []byte(secret))
	if err != nil {
		return eris.New("Invalid Credentials")
	}

	return nil
}
