package config

import (
	"fmt"
	"regexp"
	"strings"

	"npm/internal/errors"

	"github.com/rotisserie/eris"
)

const (
	DatabaseSqlite   = "sqlite"
	DatabasePostgres = "postgres"
	DatabaseMysql    = "mysql"

	// DefaultPostgresSchema is used when no schema has been specified
	DefaultPostgresSchema = "public"
)

// postgresSchemaRegex limits schema names to unquoted Postgres identifiers
// (max 63 bytes) so they can be placed in the connection string safely
var postgresSchemaRegex = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_$]{0,62}$`)

// DBConfig holds the database connection parameters. It is populated from
// NPM_DB_* environment variables when NPM_DB_DRIVER is set, otherwise from
// the db.conf file in the data folder written by the setup wizard.
type DBConfig struct {
	Driver   string `json:"driver" envconfig:"optional"`
	Host     string `json:"host" envconfig:"optional,default="`
	Port     int    `json:"port" envconfig:"optional,default="`
	Username string `json:"username" envconfig:"optional,default="`
	Password string `json:"password" envconfig:"optional,default="`
	Name     string `json:"name" envconfig:"optional,default="`
	SSLMode  string `json:"sslmode" envconfig:"optional,default=disable"`
	Schema   string `json:"schema,omitempty" envconfig:"optional,default=public"`
}

// GetDriver returns the lowercase driver name
func (d *DBConfig) GetDriver() string {
	return strings.ToLower(d.Driver)
}

// GetSchema returns the postgres schema, falling back to the default
func (d *DBConfig) GetSchema() string {
	if d.Schema == "" {
		return DefaultPostgresSchema
	}
	return d.Schema
}

// IsConfigured returns true when a database driver has been chosen, either
// by environment variables or by the setup wizard
func (d *DBConfig) IsConfigured() bool {
	return d.Driver != ""
}

// IsValid is a basic check for config. Sqlite has no host/port/credentials
// to validate; postgres and mysql require them to form a usable DSN.
func (d *DBConfig) IsValid() (bool, error) {
	var errs []error

	switch d.GetDriver() {
	case DatabaseSqlite:
		// no connection fields required
	case DatabasePostgres, DatabaseMysql:
		if d.Name == "" {
			errs = append(errs, eris.New("database name is empty"))
		}
		if d.Host == "" {
			errs = append(errs, eris.New("database host is empty"))
		}
		if d.Port <= 0 {
			errs = append(errs, eris.New("database port is invalid"))
		}
		if d.Username == "" {
			errs = append(errs, eris.New("database username is empty"))
		}
		if d.GetDriver() == DatabasePostgres && !postgresSchemaRegex.MatchString(d.GetSchema()) {
			errs = append(errs, eris.Errorf("database schema %s is invalid", d.Schema))
		}
	default:
		errs = append(errs, eris.Errorf("database driver %s is not supported. Valid options are: %s, %s or %s", d.Driver, DatabaseSqlite, DatabasePostgres, DatabaseMysql))
	}

	return len(errs) == 0, errors.Join(errs...)
}

// GetGormConnectURL is used by Gorm
func (d *DBConfig) GetGormConnectURL() string {
	switch d.GetDriver() {
	case DatabaseSqlite:
		return fmt.Sprintf("%s/nginxproxymanager.db", Configuration.DataFolder)
	case DatabasePostgres:
		return fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=%d sslmode=%s search_path=%s TimeZone=UTC",
			d.Host,
			d.Username,
			d.Password,
			d.Name,
			d.Port,
			d.SSLMode,
			d.GetSchema(),
		)
	case DatabaseMysql:
		return fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?charset=utf8mb4&parseTime=True&loc=Local",
			d.Username,
			d.Password,
			d.Host,
			d.Port,
			d.Name,
		)
	}
	return ""
}
