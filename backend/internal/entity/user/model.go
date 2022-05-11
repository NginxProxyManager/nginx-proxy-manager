package user

import (
	goerrors "errors"
	"fmt"
	"strings"
	"time"

	"npm/internal/database"
	"npm/internal/entity/auth"
	"npm/internal/errors"
	"npm/internal/logger"
	"npm/internal/types"
	"npm/internal/util"

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
	GravatarURL string       `json:"gravatar_url"`
	IsDisabled  bool         `json:"is_disabled" db:"is_disabled" filter:"is_disabled,boolean"`
	IsSystem    bool         `json:"is_system,omitempty" db:"is_system"`
	IsDeleted   bool         `json:"is_deleted,omitempty" db:"is_deleted"`
	// Expansions
	Auth         *auth.Model `json:"auth,omitempty" db:"-"`
	Capabilities []string    `json:"capabilities,omitempty"`
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
	query := fmt.Sprintf("SELECT * FROM `%s` WHERE email = ? AND is_deleted = ? AND is_system = ? LIMIT 1", tableName)
	params := []interface{}{strings.TrimSpace(strings.ToLower(email)), false, false}
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

	if m.IsSystem {
		return errors.ErrSystemUserReadonly
	}

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

// SetPermissions will wipe out any existing permissions and add new ones for this user
func (m *Model) SetPermissions(permissions []string) error {
	if m.ID == 0 {
		return fmt.Errorf("Cannot set permissions without first saving the User")
	}

	db := database.GetInstance()

	// Wipe out previous permissions
	query := `DELETE FROM "user_has_capability" WHERE "user_id" = ?`
	if _, err := db.Exec(query, m.ID); err != nil {
		logger.Debug("QUERY: %v -- %v", query, m.ID)
		return err
	}

	if len(permissions) > 0 {
		// Add new permissions
		for _, permission := range permissions {
			query = `INSERT INTO "user_has_capability" (
				"user_id", "capability_id"
			) VALUES (
				?,
				(SELECT id FROM capability WHERE name = ?)
			)`

			_, err := db.Exec(query, m.ID, permission)
			if err != nil {
				logger.Debug("QUERY: %v -- %v -- %v", query, m.ID, permission)
				return err
			}
		}
	}

	return nil
}

// Expand will fill in more properties
func (m *Model) Expand(items []string) error {
	var err error

	if util.SliceContainsItem(items, "capabilities") && m.ID > 0 {
		m.Capabilities, err = GetCapabilities(m.ID)
	}

	return err
}

func (m *Model) generateGravatar() {
	m.GravatarURL = gravatar.New(m.Email).
		Size(128).
		Default(gravatar.MysteryMan).
		Rating(gravatar.Pg).
		AvatarURL()
}

// SaveCapabilities will save the capabilities of the user.
func (m *Model) SaveCapabilities() error {
	// m.Capabilities
	if m.ID == 0 {
		return fmt.Errorf("Cannot save capabilities on unsaved user")
	}

	// there must be at least 1 capability
	if len(m.Capabilities) == 0 {
		return goerrors.New("At least 1 capability required for a user")
	}

	db := database.GetInstance()

	// Get a full list of capabilities
	var capabilities []string
	query := `SELECT "name" from "capability"`
	err := db.Select(&capabilities, query)
	if err != nil {
		return err
	}

	// Check that the capabilities defined exist in the db
	for _, cap := range m.Capabilities {
		found := false
		for _, a := range capabilities {
			if a == cap {
				found = true
			}
		}
		if !found {
			return fmt.Errorf("Capability `%s` is not valid", cap)
		}
	}

	return m.SetPermissions(m.Capabilities)
}
