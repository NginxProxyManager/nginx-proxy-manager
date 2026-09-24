// Package migrations owns the application's database schema. It replaces
// the previous dbmate-based setup: instead of hand-written, per-engine SQL
// files, each migration is a small Go function driven by gorm, so a single
// migration works against Postgres, MySQL and SQLite alike.
package migrations

import (
	"npm/internal/database"
	"npm/internal/logger"

	"github.com/go-gormigrate/gormigrate/v2"
	"gorm.io/gorm"
)

// legacyMigrationsTable is the table dbmate used to track applied
// migrations. Its presence indicates a database that was created before
// the switch to gormigrate.
const legacyMigrationsTable = "schema_migrations"

// legacyMigrationIDs maps the dbmate migration versions this application
// used to ship to the gormigrate migrations that replace them, in order.
// Existing installs already have this schema and data applied via dbmate,
// so on first boot after upgrading we mark them as already run rather
// than re-running them.
var legacyMigrationIDs = []string{
	"20201013035318", // initial_schema
	"20201013035839", // initial_data
}

// all is the ordered list of every migration this application has ever
// shipped. Entries must never be reordered or edited once released;
// schema changes are made by appending a new migration.
func all() []*gormigrate.Migration {
	return []*gormigrate.Migration{
		initialSchema(),
		initialData(),
	}
}

type afterMigrationComplete func()

// Migrate will bring the db up to date
func Migrate(followup afterMigrationComplete) bool {
	db := database.GetDB()
	if db == nil {
		return false
	}

	if err := bootstrapFromLegacyDBMate(db); err != nil {
		logger.Error("MigrationError", err)
		return false
	}

	m := gormigrate.New(db, gormigrate.DefaultOptions, all())
	if err := m.Migrate(); err != nil {
		logger.Error("MigrationError", err)
		return false
	}

	logger.Debug("Database is up to date")

	followup()
	return true
}

// bootstrapFromLegacyDBMate detects a database that was migrated by the
// old dbmate setup and pre-marks the gormigrate migrations that replace
// dbmate's initial_schema/initial_data as already applied, so gormigrate
// doesn't try to recreate tables or re-insert seed data that already
// exist. It's a no-op for a brand new database and for one that has
// already been bootstrapped.
func bootstrapFromLegacyDBMate(db *gorm.DB) error {
	if !db.Migrator().HasTable(legacyMigrationsTable) {
		// Fresh install, nothing to bootstrap.
		return nil
	}

	var legacyCount int64
	if err := db.Table(legacyMigrationsTable).Count(&legacyCount).Error; err != nil {
		return err
	}
	if legacyCount == 0 {
		return nil
	}

	if db.Migrator().HasTable(gormigrate.DefaultOptions.TableName) {
		// Already bootstrapped (or running fresh under gormigrate already).
		return nil
	}

	logger.Info("Existing dbmate-managed database detected, marking bootstrap migrations as applied")

	type migrationRecord struct {
		ID string `gorm:"primaryKey;column:id;size:255"`
	}
	if err := db.Table(gormigrate.DefaultOptions.TableName).AutoMigrate(&migrationRecord{}); err != nil {
		return err
	}

	for _, id := range legacyMigrationIDs {
		if err := db.Table(gormigrate.DefaultOptions.TableName).Create(&migrationRecord{ID: id}).Error; err != nil {
			return err
		}
	}

	return nil
}
