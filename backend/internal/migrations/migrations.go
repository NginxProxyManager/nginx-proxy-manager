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

	"npm/embed"
	"npm/internal/config"
	"npm/internal/database"
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
