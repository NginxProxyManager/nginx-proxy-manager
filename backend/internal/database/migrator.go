package database

import (
	"database/sql"
	"fmt"
	"io/fs"
	"path"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"npm/embed"
	"npm/internal/logger"
	"npm/internal/util"

	"github.com/jmoiron/sqlx"
)

// MigrationConfiguration options for the migrator.
type MigrationConfiguration struct {
	Table string `json:"table"`
	mux   sync.Mutex
}

// Default migrator configuration
var mConfiguration = MigrationConfiguration{
	Table: "migration",
}

// ConfigureMigrator and will return error if missing required fields.
func ConfigureMigrator(c *MigrationConfiguration) error {
	// ensure updates to the config are atomic
	mConfiguration.mux.Lock()
	defer mConfiguration.mux.Unlock()
	if c == nil {
		return fmt.Errorf("a non nil Configuration is mandatory")
	}
	if strings.TrimSpace(c.Table) != "" {
		mConfiguration.Table = c.Table
	}
	mConfiguration.Table = c.Table
	return nil
}

type afterMigrationComplete func()

// Migrate will perform the migration from start to finish
func Migrate(followup afterMigrationComplete) bool {
	logger.Info("Migration: Started")

	// Try to connect to the database sleeping for 15 seconds in between
	var db *sqlx.DB
	for {
		db = GetInstance()
		if db == nil {
			logger.Warn("Database is unavailable for migration, retrying in 15 seconds")
			time.Sleep(15 * time.Second)
		} else {
			break
		}
	}

	// Check for migration table existence
	if !tableExists(db, mConfiguration.Table) {
		err := createMigrationTable(db)
		if err != nil {
			logger.Error("MigratorError", err)
			return false
		}
		logger.Info("Migration: Migration Table created")
	}

	// DO MIGRATION
	migrationCount, migrateErr := performFileMigrations(db)
	if migrateErr != nil {
		logger.Error("MigratorError", migrateErr)
	}

	if migrateErr == nil {
		logger.Info("Migration: Completed %v migration files", migrationCount)
		followup()
		return true
	}
	return false
}

// createMigrationTable performs a query to create the migration table
// with the name specified in the configuration
func createMigrationTable(db *sqlx.DB) error {
	logger.Info("Migration: Creating Migration Table: %v", mConfiguration.Table)
	// nolint:lll
	query := fmt.Sprintf("CREATE TABLE IF NOT EXISTS `%v` (filename TEXT PRIMARY KEY, migrated_on INTEGER NOT NULL DEFAULT 0)", mConfiguration.Table)
	_, err := db.Exec(query)
	return err
}

// tableExists will check the database for the existence of the specified table.
func tableExists(db *sqlx.DB, tableName string) bool {
	query := `SELECT CASE name WHEN $1 THEN true ELSE false END AS found FROM sqlite_master WHERE type='table' AND name = $1`

	row := db.QueryRowx(query, tableName)
	if row == nil {
		logger.Error("MigratorError", fmt.Errorf("Cannot check if table exists, no row returned: %v", tableName))
		return false
	}

	var exists *bool
	if err := row.Scan(&exists); err != nil {
		if err == sql.ErrNoRows {
			return false
		}
		logger.Error("MigratorError", err)
		return false
	}
	return *exists
}

// performFileMigrations will perform the actual migration,
// importing files and updating the database with the rows imported.
func performFileMigrations(db *sqlx.DB) (int, error) {
	var importedCount = 0

	// Grab a list of previously ran migrations from the database:
	previousMigrations, prevErr := getPreviousMigrations(db)
	if prevErr != nil {
		return importedCount, prevErr
	}

	// List up the ".sql" files on disk
	err := fs.WalkDir(embed.MigrationFiles, ".", func(file string, d fs.DirEntry, err error) error {
		if !d.IsDir() {
			shortFile := filepath.Base(file)

			// Check if this file already exists in the previous migrations
			// and if so, ignore it
			if util.SliceContainsItem(previousMigrations, shortFile) {
				return nil
			}

			logger.Info("Migration: Importing %v", shortFile)

			sqlContents, ioErr := embed.MigrationFiles.ReadFile(path.Clean(file))
			if ioErr != nil {
				return ioErr
			}

			sqlString := string(sqlContents)

			tx := db.MustBegin()
			if _, execErr := tx.Exec(sqlString); execErr != nil {
				return execErr
			}
			if commitErr := tx.Commit(); commitErr != nil {
				return commitErr
			}
			if markErr := markMigrationSuccessful(db, shortFile); markErr != nil {
				return markErr
			}

			importedCount++
		}
		return nil
	})

	return importedCount, err
}

// getPreviousMigrations will query the migration table for names
// of migrations we can ignore because they should have already
// been imported
func getPreviousMigrations(db *sqlx.DB) ([]string, error) {
	var existingMigrations []string
	// nolint:gosec
	query := fmt.Sprintf("SELECT filename FROM `%v` ORDER BY filename", mConfiguration.Table)
	rows, err := db.Queryx(query)
	if err != nil {
		if err == sql.ErrNoRows {
			return existingMigrations, nil
		}
		return existingMigrations, err
	}

	for rows.Next() {
		var filename *string
		err := rows.Scan(&filename)
		if err != nil {
			return existingMigrations, err
		}
		existingMigrations = append(existingMigrations, *filename)
	}

	return existingMigrations, nil
}

// markMigrationSuccessful will add a row to the migration table
func markMigrationSuccessful(db *sqlx.DB, filename string) error {
	// nolint:gosec
	query := fmt.Sprintf("INSERT INTO `%v` (filename) VALUES ($1)", mConfiguration.Table)
	_, err := db.Exec(query, filename)
	return err
}
