// Package migrations owns the application's database schema and seed data.
//
// Both live as portable polyschema migration files in embed/migrations/
// (see https://github.com/jc21/polyschema): one YAML file per change,
// rendered into the right SQL for Postgres, MySQL or SQLite at runtime.
// Applied files are recorded in the historyTable, so on every boot only
// pending files run.
//
// Applied files must never be edited: polyschema checksums them and
// refuses to start if one changes. Schema changes are made by adding a
// new file with a higher version number.
package migrations

import (
	"context"
	"database/sql"
	"fmt"
	"io/fs"

	"gorm.io/gorm"
	"npm/embed"
	"npm/internal/config"
	"npm/internal/database"
	"npm/internal/entity/sso"
	"npm/internal/logger"

	polyschema "github.com/jc21/polyschema/v1"
)

// historyTable tracks which migration files have been applied.
const historyTable = "migrations"

type afterMigrationComplete func()

// Migrate applies any pending migrations, then calls followup on success.
func Migrate(followup afterMigrationComplete) bool {
	db := database.GetDB()
	if db == nil {
		return false
	}

	sqlDB, err := db.DB()
	if err != nil {
		logger.Error("MigrationError", err)
		return false
	}

	if err := migrate(sqlDB); err != nil {
		logger.Error("MigrationError", err)
		return false
	}

	logger.Debug("Database is up to date")

	followup()
	return true
}

// migrate applies every pending file in embed/migrations/ for the
// configured database engine.
func migrate(sqlDB *sql.DB) error {
	engine := config.Configuration.DB.GetDriver()
	dialect := polyschema.DialectByName(engine)
	if dialect == nil {
		return fmt.Errorf("migrations: unsupported database driver %q", engine)
	}
	if err := preflightSSO(database.GetDB()); err != nil {
		return err
	}

	files, err := fs.Sub(embed.MigrationFiles, "migrations")
	if err != nil {
		return err
	}

	m := polyschema.New(sqlDB, dialect,
		polyschema.WithTable(historyTable),
		polyschema.WithLogger(newSlogLogger()),
	)
	return m.Up(context.Background(), files)
}

// Refuse ambiguous upgrades before any SSO schema change. Never merge accounts.
func preflightSSO(db *gorm.DB) error {
	if db == nil || !db.Migrator().HasTable("user") {
		return nil
	}
	if db.Migrator().HasTable(historyTable) {
		var count int64
		if err := db.Table(historyTable).Where("version = ?", int64(20261023000000)).Count(&count).Error; err != nil {
			return err
		}
		if count > 0 {
			return nil
		}
	}
	var users []struct {
		ID    uint   `gorm:"column:id"`
		Email string `gorm:"column:email"`
	}
	if err := db.Table("user").Where("is_system = ? AND is_deleted = ?", false, 0).Order("id").Find(&users).Error; err != nil {
		return err
	}
	seen := map[string]uint{}
	for _, value := range users {
		normalized, err := sso.NormalizeEmail(value.Email)
		if err != nil {
			return fmt.Errorf("SSO upgrade: user ID %d has an invalid email; resolve using a database backup before retrying", value.ID)
		}
		if previous, ok := seen[normalized]; ok {
			return fmt.Errorf("SSO upgrade: conflicting user IDs %d and %d normalize to the same email; resolve using a database backup before retrying", previous, value.ID)
		}
		seen[normalized] = value.ID
	}
	return nil
}
