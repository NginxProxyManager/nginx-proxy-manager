package migrations

import (
	"io/fs"
	"path/filepath"
	"testing"

	"npm/embed"
	"npm/internal/config"
	"npm/internal/database"
	"npm/internal/entity"
	"npm/internal/entity/certificateauthority"
	"npm/internal/entity/nginxtemplate"
	"npm/internal/entity/setting"
	"npm/internal/entity/user"

	"github.com/glebarez/sqlite"
	polyschema "github.com/jc21/polyschema/v1"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"
)

func openTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	config.Configuration.DB.Driver = config.DatabaseSqlite
	dsn := filepath.Join(t.TempDir(), "test.db")
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{Logger: gormlogger.Default.LogMode(gormlogger.Silent)})
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

	var historyCount int64
	require.NoError(t, db.Table(historyTable).Count(&historyCount).Error)
	assert.EqualValues(t, 2, historyCount, "one history row per migration file")
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

func TestMigrateNoDB(t *testing.T) {
	database.SetDB(nil)
	assert.False(t, Migrate(func() {
		t.Error("followup should not be called")
	}))
}

// TestMigrationsRenderForEveryEngine catches a migration file that won't
// run on one of the supported engines, without needing those databases.
func TestMigrationsRenderForEveryEngine(t *testing.T) {
	files, err := fs.Sub(embed.MigrationFiles, "migrations")
	require.NoError(t, err)

	issues, err := polyschema.CheckFS(files, polyschema.Postgres, polyschema.MySQL, polyschema.SQLite)
	require.NoError(t, err)
	for _, is := range issues {
		if is.Severity == polyschema.Error {
			t.Error(is)
		} else {
			t.Log(is)
		}
	}
}
