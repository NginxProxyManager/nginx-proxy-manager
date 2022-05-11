package database

import (
	"database/sql"

	"npm/internal/config"
	"npm/internal/errors"
	"npm/internal/logger"
)

// CheckSetup Quick check by counting the number of users in the database
func CheckSetup() {
	query := `SELECT COUNT(*) FROM "user" WHERE is_deleted = $1 AND is_disabled = $1 AND is_system = $1`
	db := GetInstance()

	if db != nil {
		row := db.QueryRowx(query, false)
		var totalRows int
		queryErr := row.Scan(&totalRows)
		if queryErr != nil && queryErr != sql.ErrNoRows {
			logger.Error("SetupError", queryErr)
			return
		}
		if totalRows == 0 {
			logger.Warn("No users found, starting in Setup Mode")
		} else {
			config.IsSetup = true
			logger.Info("Application is setup")
		}

		if config.ErrorReporting {
			logger.Warn("Error reporting is enabled - Application Errors WILL be sent to Sentry, you can disable this in the Settings interface")
		}
	} else {
		logger.Error("DatabaseError", errors.ErrDatabaseUnavailable)
	}
}
