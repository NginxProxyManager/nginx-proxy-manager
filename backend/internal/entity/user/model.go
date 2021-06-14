package user

import (
	"fmt"
	"strings"
	"time"

	"npm/internal/database"
	"npm/internal/entity/auth"
	"npm/internal/types"

	"github.com/drexedam/gravatar"
)

const (
	tableName = "user"
)

// Model is the user model
type Model struct {
	ID          int          `json:"id" db:"id" filter:"id,integer"`
	Name        string       `json:"name" db:"name" filter:"name,string"`
	Nickname    string       `json:"nickname" db:"nickname" filter:"nickname,string"`
	Email       string       `json:"email" db:"email" filter:"email,email"`
	CreatedOn   types.DBDate `json:"created_on" db:"created_on" filter:"created_on,integer"`
	ModifiedOn  types.DBDate `json:"modified_on" db:"modified_on" filter:"modified_on,integer"`
	Roles       types.Roles  `json:"roles" db:"roles"`
	GravatarURL string       `json:"gravatar_url"`
	IsDisabled  bool         `json:"is_disabled" db:"is_disabled" filter:"is_disabled,boolean"`
	IsDeleted   bool         `json:"is_deleted,omitempty" db:"is_deleted"`
	// Expansions
	Auth *auth.Model `json:"auth,omitempty" db:"-"`
}

func (m *Model) getByQuery(query string, params []interface{}) error {
	err := database.GetByQuery(m, query, params)
	m.generateGravatar()
	return err
}

// LoadByID will load from an ID
func (m *Model) LoadByID(id int) error {
	query := fmt.Sprintf("SELECT * FROM `%s` WHERE id = ? AND is_deleted = ? LIMIT 1", tableName)
	params := []interface{}{id, false}
	return m.getByQuery(query, params)
}

// LoadByEmail will load from an Email
func (m *Model) LoadByEmail(email string) error {
	query := fmt.Sprintf("SELECT * FROM `%s` WHERE email = ? AND is_deleted = ? LIMIT 1", tableName)
	params := []interface{}{strings.TrimSpace(strings.ToLower(email)), false}
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
	m.generateGravatar()
}

// Save will save this model to the DB
func (m *Model) Save() error {
	var err error
	// Ensure email is nice
	m.Email = strings.TrimSpace(strings.ToLower(m.Email))

	if m.ID == 0 {
		m.ID, err = Create(m)
	} else {
		err = Update(m)
	}

	return err
}

// Delete will mark a user as deleted
func (m *Model) Delete() bool {
	m.Touch(false)
	m.IsDeleted = true
	if err := m.Save(); err != nil {
		return false
	}
	return true
}

func (m *Model) generateGravatar() {
	m.GravatarURL = gravatar.New(m.Email).
		Size(128).
		Default(gravatar.MysteryMan).
		Rating(gravatar.Pg).
		AvatarURL()
}
