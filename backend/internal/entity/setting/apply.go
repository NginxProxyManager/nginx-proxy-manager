package setting

import (
	"npm/internal/config"
	"npm/internal/logger"
)

// ApplySettings will load settings from the DB and apply them where required
func ApplySettings() {
	logger.Debug("Applying Settings")

	// Error-reporting
	m, _ := GetByName("error-reporting")
	config.ErrorReporting = m.Value.Decoded.(bool)
}
