package database

import (
	"fmt"
	"strings"

	"npm/internal/config"
	"npm/internal/logger"

	"github.com/glebarez/sqlite"
	"github.com/rotisserie/eris"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"
	"gorm.io/gorm/schema"
)

var dbInstance *gorm.DB

// NewDB creates a new connection
func NewDB() {
	logger.Info("Creating new DB instance using %s", strings.ToLower(config.Configuration.DB.Driver))
	db, err := connect()
	if err != nil {
		logger.Error("DatabaseConnectError", err)
	} else if db != nil {
		dbInstance = db
	}
}

// GetDB returns an existing or new instance
func GetDB() *gorm.DB {
	if dbInstance == nil {
		NewDB()
	}
	return dbInstance
}

func connect() (*gorm.DB, error) {
	var d gorm.Dialector
	dsn := config.Configuration.DB.GetGormConnectURL()
	switch strings.ToLower(config.Configuration.DB.Driver) {

	case config.DatabaseSqlite:
		// autocreate(dsn)
		d = sqlite.Open(dsn)

	case config.DatabasePostgres:
		d = postgres.Open(dsn)

	case config.DatabaseMysql:
		d = mysql.Open(dsn)

	default:
		return nil, eris.New(fmt.Sprintf("Database driver %s is not supported. Valid options are: %s, %s or %s", config.Configuration.DB.Driver, config.DatabaseSqlite, config.DatabasePostgres, config.DatabaseMysql))
	}

	return gorm.Open(d, &gorm.Config{
		// see: https://gorm.io/docs/gorm_config.html
		NamingStrategy: schema.NamingStrategy{
			SingularTable: true,
			NoLowerCase:   true,
		},
		PrepareStmt: false,
		Logger:      gormlogger.Default.LogMode(gormlogger.Silent),
	})
}

/*
func autocreate(dbFile string) {
	if _, err := os.Stat(dbFile); os.IsNotExist(err) {
		// Create it
		logger.Info("Creating Sqlite DB: %s", dbFile)
		// nolint: gosec
		_, err = os.Create(dbFile)
		if err != nil {
			logger.Error("FileCreateError", err)
		}
	}
}
*/
