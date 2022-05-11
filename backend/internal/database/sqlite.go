package database

import (
	"fmt"
	"os"

	"npm/internal/config"
	"npm/internal/logger"

	"github.com/jmoiron/sqlx"

	// Blank import for Sqlite
	_ "github.com/mattn/go-sqlite3"
)

var dbInstance *sqlx.DB

// NewDB creates a new connection
func NewDB() {
	logger.Info("Creating new DB instance")
	db := SqliteDB()
	if db != nil {
		dbInstance = db
	}
}

// GetInstance returns an existing or new instance
func GetInstance() *sqlx.DB {
	if dbInstance == nil {
		NewDB()
	} else if err := dbInstance.Ping(); err != nil {
		NewDB()
	}

	return dbInstance
}

// SqliteDB Create sqlite client
func SqliteDB() *sqlx.DB {
	dbFile := fmt.Sprintf("%s/nginxproxymanager.db", config.Configuration.DataFolder)
	autocreate(dbFile)
	db, err := sqlx.Open("sqlite3", dbFile)
	if err != nil {
		logger.Error("SqliteError", err)
		return nil
	}

	return db
}

// Commit will close and reopen the db file
func Commit() *sqlx.DB {
	if dbInstance != nil {
		err := dbInstance.Close()
		if err != nil {
			logger.Error("DatabaseCloseError", err)
		}
	}
	NewDB()
	return dbInstance
}

func autocreate(dbFile string) {
	if _, err := os.Stat(dbFile); os.IsNotExist(err) {
		// Create it
		logger.Info("Creating Sqlite DB: %s", dbFile)
		// nolint: gosec
		_, err = os.Create(dbFile)
		if err != nil {
			logger.Error("FileCreateError", err)
		}
		Commit()
	}
}
