package migrations

import (
	"path/filepath"
	"testing"

	"npm/internal/database"
	"npm/internal/entity"
	"npm/internal/entity/certificateauthority"
	"npm/internal/entity/nginxtemplate"
	"npm/internal/entity/setting"
	"npm/internal/entity/user"

	"github.com/glebarez/sqlite"
	"github.com/go-gormigrate/gormigrate/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func openTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := filepath.Join(t.TempDir(), "test.db")
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	return db
}

func TestMigrateFreshDatabase(t *testing.T) {
	db := openTestDB(t)
	database.SetDB(db)

	followupCalled := false
	ok := Migrate(func() { followupCalled = true })
	require.True(t, ok)
	assert.True(t, followupCalled)

	var capabilityCount int64
	require.NoError(t, db.Model(&entity.Capability{}).Count(&capabilityCount).Error)
	assert.EqualValues(t, 18, capabilityCount)

	var settingCount int64
	require.NoError(t, db.Model(&setting.Model{}).Count(&settingCount).Error)
	assert.EqualValues(t, 4, settingCount)

	var caCount int64
	require.NoError(t, db.Model(&certificateauthority.Model{}).Count(&caCount).Error)
	assert.EqualValues(t, 6, caCount)

	var userCount int64
	require.NoError(t, db.Model(&user.Model{}).Where("is_system = ?", true).Count(&userCount).Error)
	assert.EqualValues(t, 1, userCount)

	var templateCount int64
	require.NoError(t, db.Model(&nginxtemplate.Model{}).Count(&templateCount).Error)
	assert.EqualValues(t, 5, templateCount)

	var migrationCount int64
	require.NoError(t, db.Table(gormigrate.DefaultOptions.TableName).Count(&migrationCount).Error)
	assert.EqualValues(t, len(all()), migrationCount)
}

func TestMigrateIsIdempotent(t *testing.T) {
	db := openTestDB(t)
	database.SetDB(db)

	require.True(t, Migrate(func() {}))
	require.True(t, Migrate(func() {}))

	var capabilityCount int64
	require.NoError(t, db.Model(&entity.Capability{}).Count(&capabilityCount).Error)
	assert.EqualValues(t, 18, capabilityCount)

	var userCount int64
	require.NoError(t, db.Model(&user.Model{}).Count(&userCount).Error)
	assert.EqualValues(t, 1, userCount)
}

// TestBootstrapFromLegacyDBMate simulates a database that was previously
// migrated by dbmate: it has dbmate's schema_migrations table with the two
// legacy versions recorded, and already contains seeded data. Migrate must
// detect this and mark the equivalent gormigrate migrations as already
// applied instead of re-running them and duplicating the seed data.
func TestBootstrapFromLegacyDBMate(t *testing.T) {
	db := openTestDB(t)
	database.SetDB(db)

	require.NoError(t, db.Exec(`CREATE TABLE schema_migrations (version TEXT PRIMARY KEY)`).Error)
	for _, v := range legacyMigrationIDs {
		require.NoError(t, db.Exec(`INSERT INTO schema_migrations (version) VALUES (?)`, v).Error)
	}
	require.NoError(t, db.Exec(`CREATE TABLE capability (name TEXT PRIMARY KEY)`).Error)
	require.NoError(t, db.Exec(`INSERT INTO capability (name) VALUES (?)`, "full-admin").Error)

	require.True(t, Migrate(func() {}))

	var capabilityCount int64
	require.NoError(t, db.Table("capability").Count(&capabilityCount).Error)
	assert.EqualValues(t, 1, capabilityCount, "legacy data must not be re-seeded")

	var migrationIDs []string
	require.NoError(t, db.Table(gormigrate.DefaultOptions.TableName).Pluck("id", &migrationIDs).Error)
	assert.ElementsMatch(t, legacyMigrationIDs, migrationIDs)
}

func TestMigrateNoDB(t *testing.T) {
	database.SetDB(nil)
	assert.False(t, Migrate(func() {
		t.Error("followup should not be called")
	}))
}
