package auth

import (
	"fmt"
	"time"

	"npm/internal/database"
	"npm/internal/types"

	"github.com/rotisserie/eris"
	"golang.org/x/crypto/bcrypt"
)

const (
	tableName = "auth"

	// TypePassword is the Password Type
	TypePassword = "password"
)

// Model is the user model
type Model struct {
	ID         int          `json:"id" db:"id"`
	UserID     int          `json:"user_id" db:"user_id"`
	Type       string       `json:"type" db:"type"`
	Secret     string       `json:"secret,omitempty" db:"secret"`
	CreatedOn  types.DBDate `json:"created_on" db:"created_on"`
	ModifiedOn types.DBDate `json:"modified_on" db:"modified_on"`
	IsDeleted  bool         `json:"is_deleted,omitempty" db:"is_deleted"`
}

func (m *Model) getByQuery(query string, params []interface{}) error {
	return database.GetByQuery(m, query, params)
}

// LoadByID will load from an ID
func (m *Model) LoadByID(id int) error {
	query := fmt.Sprintf("SELECT * FROM `%s` WHERE id = ? LIMIT 1", tableName)
	params := []interface{}{id}
	return m.getByQuery(query, params)
}

// LoadByUserIDType will load from an ID
func (m *Model) LoadByUserIDType(userID int, authType string) error {
	query := fmt.Sprintf("SELECT * FROM `%s` WHERE user_id = ? AND type = ? LIMIT 1", tableName)
	params := []interface{}{userID, authType}
	return m.getByQuery(query, params)
}

// Touch will update model's timestamp(s)
func (m *Model) Touch(created bool) {
	var d types.DBDate
	d.Time = time.Now()
	if created {
		m.CreatedOn = d
	}
	m.ModifiedOn = d
}

// Save will save this model to the DB
func (m *Model) Save() error {
	var err error

	if m.ID == 0 {
		m.ID, err = Create(m)
	} else {
		err = Update(m)
	}

	return err
}

// SetPassword will generate a hashed password based on given string
func (m *Model) SetPassword(password string) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.MinCost+2)
	if err != nil {
		return err
	}

	m.Type = TypePassword
	m.Secret = string(hash)

	return nil
}

// ValidateSecret will check if a given secret matches the encrypted secret
func (m *Model) ValidateSecret(secret string) error {
	if m.Type != TypePassword {
		return eris.New("Could not validate Secret, auth type is not a Password")
	}

	err := bcrypt.CompareHashAndPassword([]byte(m.Secret), []byte(secret))
	if err != nil {
		return eris.New("Invalid Password")
	}

	return nil
}
