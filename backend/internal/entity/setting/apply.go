package setting

import (
	"npm/internal/config"
	"npm/internal/logger"
)

// ApplySettings will load settings from the DB and apply them where required
func ApplySettings() {
	logger.Debug("Applying Settings")

	// Error-reporting
	m, err := GetByName("error-reporting")
	if err != nil {
		logger.Error("ApplySettingsError", err)
	} else {
		config.ErrorReporting = m.Value.Decoded.(bool)
	}
}
