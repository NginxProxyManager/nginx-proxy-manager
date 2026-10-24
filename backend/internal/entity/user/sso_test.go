package user

import (
	"path/filepath"
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestGetOrCreateSSOUsesExistingIdentityWithoutChangingPermissions(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "users.db")), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&Model{}, &HasCapabilityModel{}))
	require.NoError(t, db.Exec("CREATE UNIQUE INDEX user_active_normalized_email ON user (normalized_email)").Error)

	value, created, err := GetOrCreateSSO(db, " User@Example.COM ", "First")
	require.NoError(t, err)
	require.True(t, created)
	require.Equal(t, "user@example.com", value.Email)
	require.Equal(t, "sso", value.CredentialOrigin)
	require.False(t, value.AdminPasswordEnabled)
	var capabilityCount int64
	require.NoError(t, db.Model(&HasCapabilityModel{}).Where("user_id = ?", value.ID).Count(&capabilityCount).Error)
	require.Zero(t, capabilityCount)

	again, created, err := GetOrCreateSSO(db, "user@example.com", "Different")
	require.NoError(t, err)
	require.False(t, created)
	require.Equal(t, value.ID, again.ID)
	require.Equal(t, "First", again.Name)

	require.NoError(t, db.Model(&Model{}).Where("id = ?", value.ID).Update("is_disabled", true).Error)
	_, _, err = GetOrCreateSSO(db, "USER@example.com", "Different")
	require.ErrorContains(t, err, "disabled")
}
