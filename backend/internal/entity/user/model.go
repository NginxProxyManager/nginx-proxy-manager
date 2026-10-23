package user

import (
	"strings"

	"npm/internal/database"
	"npm/internal/entity"
	"npm/internal/entity/auth"
	"npm/internal/entity/sso"
	"npm/internal/errors"
	"npm/internal/model"
	"npm/internal/util"

	"github.com/drexedam/gravatar"
	"github.com/rotisserie/eris"
	"gorm.io/gorm"
)

// Model is the model
type Model struct {
	model.Base
	Name                 string  `json:"name" gorm:"column:name" filter:"name,string"`
	Email                string  `json:"email" gorm:"column:email" filter:"email,email"`
	IsDisabled           bool    `json:"is_disabled" gorm:"column:is_disabled" filter:"is_disabled,boolean"`
	IsSystem             bool    `json:"is_system,omitempty" gorm:"column:is_system" filter:"is_system,boolean"`
	NormalizedEmail      *string `json:"-" gorm:"column:normalized_email;size:254"`
	AdminPasswordEnabled bool    `json:"admin_password_enabled" gorm:"column:admin_password_enabled"`
	CredentialOrigin     string  `json:"-" gorm:"column:credential_origin;size:32"`
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

// HasCapabilityModel is the model
type HasCapabilityModel struct {
	UserID         uint   `json:"user_id" gorm:"column:user_id"`
	CapabilityName string `json:"name" gorm:"column:capability_name"`
}

// TableName overrides the table name used by gorm
func (HasCapabilityModel) TableName() string {
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
func (m *Model) Save() error { return m.SaveInTx(database.GetDB()) }

// SaveInTx uses the caller's transaction; policy callers must hold the fence.
func (m *Model) SaveInTx(db *gorm.DB) error {
	if m.IsSystem {
		return errors.ErrSystemUserReadonly
	}

	// Ensure email is nice
	m.Email = strings.TrimSpace(strings.ToLower(m.Email))
	normalized, err := sso.NormalizeEmail(m.Email)
	if err != nil {
		return err
	}
	m.NormalizedEmail = &normalized
	if m.CredentialOrigin == "" {
		m.CredentialOrigin = "local"
	}

	// Check if an existing user with this email exists
	var m2 Model
	if err := db.Where("email = ?", m.Email).Where("is_system = ?", false).First(&m2).Error; err == nil && m.ID != m2.ID {
		return errors.ErrDuplicateEmailUser
	}

	result := db.Save(m)
	return result.Error
}

// Delete will mark a user as deleted
func (m *Model) Delete() error {
	if m.ID == 0 {
		return eris.New("Unable to delete a new object")
	}
	return database.GetDB().Transaction(func(tx *gorm.DB) error { return m.DeleteInTx(tx) })
}

func (m *Model) DeleteInTx(tx *gorm.DB) error {
	if m.ID == 0 {
		return eris.New("Unable to delete a new object")
	}
	if err := tx.Model(m).Update("normalized_email", nil).Error; err != nil {
		return err
	}
	return tx.Delete(m).Error
}

// SetPermissions will wipe out any existing permissions and add new ones for this user
func (m *Model) SetPermissions(permissions []string) error {
	return m.setPermissionsInTx(database.GetDB(), permissions)
}

func (m *Model) setPermissionsInTx(db *gorm.DB, permissions []string) error {
	if m.ID == 0 {
		return eris.Errorf("Cannot set permissions without first saving the User")
	}

	// Wipe out previous permissions
	if result := db.Where("user_id = ?", m.ID).Delete(&HasCapabilityModel{}); result.Error != nil {
		return result.Error
	}

	if len(permissions) > 0 {
		// Add new permissions
		objs := []*HasCapabilityModel{}
		for _, permission := range permissions {
			objs = append(objs, &HasCapabilityModel{UserID: m.ID, CapabilityName: permission})
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
func (m *Model) SaveCapabilities() error { return m.SaveCapabilitiesInTx(database.GetDB()) }

// SaveCapabilitiesInTx validates and replaces permissions in the caller's transaction.
func (m *Model) SaveCapabilitiesInTx(db *gorm.DB) error {
	// m.Capabilities
	if m.ID == 0 {
		return eris.Errorf("Cannot save capabilities on unsaved user")
	}

	// there must be at least 1 capability
	if len(m.Capabilities) == 0 && m.CredentialOrigin != "sso" {
		return eris.New("At least 1 capability required for a user")
	}

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

	return m.setPermissionsInTx(db, m.Capabilities)
}
