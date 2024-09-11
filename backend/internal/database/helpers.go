package database

import (
	"fmt"
	"npm/internal/config"
	"strings"
)

const (
	// DateFormat for DateFormat
	DateFormat = "2006-01-02"
	// DateTimeFormat for DateTimeFormat
	DateTimeFormat = "2006-01-02T15:04:05"
)

// QuoteTableName is a special function that will quote a table
// name based on the driver. Gorm normally handles this but this
// is for special cases where we run raw sql
func QuoteTableName(tbl string) string {
	switch strings.ToLower(config.Configuration.DB.Driver) {
	case config.DatabaseMysql:
		// backticks for mysql
		return fmt.Sprintf("`%s`", tbl)
	default:
		// double quotes for everything else
		return fmt.Sprintf(`"%s"`, tbl)
	}
}

// GetCaseInsensitiveLike returns a different operator based on
// the db driver
func GetCaseInsensitiveLike() string {
	switch strings.ToLower(config.Configuration.DB.Driver) {
	case config.DatabasePostgres:
		return "ILIKE"
	default:
		return "LIKE"
	}
}
