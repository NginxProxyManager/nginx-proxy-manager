package user

import (
	"strings"

	"npm/internal/database"
	"npm/internal/entity"
	"npm/internal/entity/auth"
	"npm/internal/errors"
	"npm/internal/model"
	"npm/internal/util"

	"github.com/drexedam/gravatar"
	"github.com/rotisserie/eris"
)

// Model is the model
type Model struct {
	model.ModelBase
	Name       string `json:"name" gorm:"column:name" filter:"name,string"`
	Email      string `json:"email" gorm:"column:email" filter:"email,email"`
	IsDisabled bool   `json:"is_disabled" gorm:"column:is_disabled" filter:"is_disabled,boolean"`
	IsSystem   bool   `json:"is_system,omitempty" gorm:"column:is_system" filter:"is_system,boolean"`
	// Other
	GravatarURL string `json:"gravatar_url" gorm:"-"`
	// Expansions
	Auth         *auth.Model `json:"auth,omitempty" gorm:"-"`
	Capabilities []string    `json:"capabilities,omitempty" gorm:"-"`
}

// TableName overrides the table name used by gorm
func (Model) TableName() string {
	return "user"
}

// UserHasCapabilityModel is the model
type UserHasCapabilityModel struct {
	UserID         uint   `json:"user_id" gorm:"column:user_id"`
	CapabilityName string `json:"name" gorm:"column:capability_name"`
}

// TableName overrides the table name used by gorm
func (UserHasCapabilityModel) TableName() string {
	return "user_has_capability"
}

// LoadByID will load from an ID
func (m *Model) LoadByID(id uint) error {
	db := database.GetDB()
	result := db.First(&m, id)
	return result.Error
}

// LoadByEmail will load from an Email
func (m *Model) LoadByEmail(email string) error {
	db := database.GetDB()
	result := db.
		Where("email = ?", strings.TrimSpace(strings.ToLower(email))).
		Where("is_system = ?", false).
		First(&m)
	return result.Error
}

// Save will save this model to the DB
func (m *Model) Save() error {
	if m.IsSystem {
		return errors.ErrSystemUserReadonly
	}

	// Ensure email is nice
	m.Email = strings.TrimSpace(strings.ToLower(m.Email))

	// Check if an existing user with this email exists
	if m2, err := GetByEmail(m.Email); err == nil && m.ID != m2.ID {
		return errors.ErrDuplicateEmailUser
	}

	db := database.GetDB()
	result := db.Save(m)
	return result.Error
}

// Delete will mark a user as deleted
func (m *Model) Delete() error {
	if m.ID == 0 {
		// Can't delete a new object
		return eris.New("Unable to delete a new object")
	}
	db := database.GetDB()
	result := db.Delete(m)
	return result.Error
}

// SetPermissions will wipe out any existing permissions and add new ones for this user
func (m *Model) SetPermissions(permissions []string) error {
	if m.ID == 0 {
		return eris.Errorf("Cannot set permissions without first saving the User")
	}

	db := database.GetDB()
	// Wipe out previous permissions
	if result := db.Where("user_id = ?", m.ID).Delete(&UserHasCapabilityModel{}); result.Error != nil {
		return result.Error
	}

	if len(permissions) > 0 {
		// Add new permissions
		objs := []*UserHasCapabilityModel{}
		for _, permission := range permissions {
			objs = append(objs, &UserHasCapabilityModel{UserID: m.ID, CapabilityName: permission})
		}
		if result := db.Create(objs); result.Error != nil {
			return result.Error
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
		return eris.Errorf("Cannot save capabilities on unsaved user")
	}

	// there must be at least 1 capability
	if len(m.Capabilities) == 0 {
		return eris.New("At least 1 capability required for a user")
	}

	db := database.GetDB()
	// Get a full list of capabilities
	var capabilities []entity.Capability
	if result := db.Find(&capabilities); result.Error != nil {
		return result.Error
	}

	// Check that the capabilities defined exist in the db
	for _, cap := range m.Capabilities {
		found := false
		for _, a := range capabilities {
			if a.Name == cap {
				found = true
			}
		}
		if !found {
			return eris.Errorf("Capability `%s` is not valid", cap)
		}
	}

	return m.SetPermissions(m.Capabilities)
}
