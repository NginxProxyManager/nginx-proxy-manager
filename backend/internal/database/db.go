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
	if !config.Configuration.DB.IsConfigured() {
		// The setup wizard hasn't been completed yet
		return
	}

	if ok, err := config.Configuration.DB.IsValid(); !ok {
		logger.Error("DatabaseError", eris.Wrapf(err, "database configuration is invalid, check %s or NPM_DB_* environment variables", config.GetDBConfigFile()))
		return
	}

	logger.Info("Creating new DB instance using %s", strings.ToLower(config.Configuration.DB.Driver))
	db, err := connect(&config.Configuration.DB)
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

// TestConnection opens a connection using the given config and pings the
// server, without affecting the current instance. Used by the setup wizard
// to validate parameters before they are saved.
func TestConnection(cfg config.DBConfig) error {
	if ok, err := cfg.IsValid(); !ok {
		return err
	}

	db, err := connect(&cfg)
	if err != nil {
		return err
	}

	sqlDB, err := db.DB()
	if err != nil {
		return err
	}
	// nolint: errcheck
	defer sqlDB.Close()

	return sqlDB.Ping()
}

// Close closes and discards the current instance, if any
func Close() {
	if dbInstance == nil {
		return
	}
	if sqlDB, err := dbInstance.DB(); err == nil {
		// nolint: errcheck, gosec
		sqlDB.Close()
	}
	dbInstance = nil
}

// SetDB will set the dbInstance to this
// Used by unit testing to set the db to a mock database
func SetDB(db *gorm.DB) {
	dbInstance = db
}

func connect(dbCfg *config.DBConfig) (*gorm.DB, error) {
	var d gorm.Dialector
	dsn := dbCfg.GetGormConnectURL()

	switch dbCfg.GetDriver() {
	case config.DatabaseSqlite:
		// autocreate(dsn)
		d = sqlite.Open(dsn)

	case config.DatabasePostgres:
		d = postgres.Open(dsn)

	case config.DatabaseMysql:
		d = mysql.Open(dsn)

	default:
		return nil, eris.New(fmt.Sprintf("Database driver %s is not supported. Valid options are: %s, %s or %s", dbCfg.Driver, config.DatabaseSqlite, config.DatabasePostgres, config.DatabaseMysql))
	}

	// see: https://gorm.io/docs/gorm_config.html
	cfg := gorm.Config{
		NamingStrategy: schema.NamingStrategy{
			SingularTable: true,
			NoLowerCase:   true,
		},
		PrepareStmt: false,
	}

	// Silence gorm query errors unless when not in debug mode
	if config.GetLogLevel() != logger.DebugLevel {
		cfg.Logger = gormlogger.Default.LogMode(gormlogger.Silent)
	}

	return gorm.Open(d, &cfg)
}
