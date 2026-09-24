package config

import (
	"fmt"
	"strings"

	"npm/internal/errors"

	"github.com/rotisserie/eris"
)

const (
	DatabaseSqlite   = "sqlite"
	DatabasePostgres = "postgres"
	DatabaseMysql    = "mysql"
)

type db struct {
	Driver   string `json:"driver" envconfig:"optional,default=sqlite"`
	Host     string `json:"host" envconfig:"optional,default="`
	Port     int    `json:"port" envconfig:"optional,default="`
	Username string `json:"username" envconfig:"optional,default="`
	Password string `json:"password" envconfig:"optional,default="`
	Name     string `json:"name" envconfig:"optional,default="`
	SSLMode  string `json:"sslmode" envconfig:"optional,default=disable"`
}

// GetDriver returns the lowercase driver name
func (d *db) GetDriver() string {
	return strings.ToLower(d.Driver)
}

// IsValid is a basic check for config. Sqlite has no host/port/credentials
// to validate; postgres and mysql require them to form a usable DSN.
func (d *db) IsValid() (bool, error) {
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
	default:
		errs = append(errs, eris.Errorf("database driver %s is not supported. Valid options are: %s, %s or %s", d.Driver, DatabaseSqlite, DatabasePostgres, DatabaseMysql))
	}

	return len(errs) == 0, errors.Join(errs...)
}

// GetGormConnectURL is used by Gorm
func (d *db) GetGormConnectURL() string {
	switch d.GetDriver() {
	case DatabaseSqlite:
		return fmt.Sprintf("%s/nginxproxymanager.db", Configuration.DataFolder)
	case DatabasePostgres:
		return fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=%d sslmode=%s TimeZone=UTC",
			d.Host,
			d.Username,
			d.Password,
			d.Name,
			d.Port,
			d.SSLMode,
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

// GetDBMateConnectURL is used by Dbmate
func (d *db) GetDBMateConnectURL() string {
	switch d.GetDriver() {
	case DatabaseSqlite:
		return fmt.Sprintf("sqlite:%s/nginxproxymanager.db", Configuration.DataFolder)
	case DatabasePostgres:
		return fmt.Sprintf("postgres://%s:%s@%s:%d/%s?sslmode=%s",
			d.Username,
			d.Password,
			d.Host,
			d.Port,
			d.Name,
			d.SSLMode,
		)
	case DatabaseMysql:
		return fmt.Sprintf("mysql://%s:%s@%s:%d/%s",
			d.Username,
			d.Password,
			d.Host,
			d.Port,
			d.Name,
		)
	}
	return ""
}
