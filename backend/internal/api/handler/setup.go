package handler

import (
	"encoding/json"
	"net/http"
	"sync"

	c "npm/internal/api/context"
	h "npm/internal/api/http"
	"npm/internal/config"
	"npm/internal/database"
	"npm/internal/logger"
)

// SetupDatabase tests the connection parameters provided by the setup
// wizard, saves them to the db.conf file and then calls onConfigured to
// connect, migrate and finish starting the application.
// Route: POST /setup/database
func SetupDatabase(onConfigured func() error) func(http.ResponseWriter, *http.Request) {
	// Serialises submissions so that two browsers can't race to
	// configure different databases
	var mu sync.Mutex

	return func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()

		if config.IsDBSetup {
			h.ResultErrorJSON(w, r, http.StatusForbidden, "Database is already configured", nil)
			return
		}

		bodyBytes, _ := r.Context().Value(c.BodyCtxKey).([]byte)
		var newCfg config.DBConfig
		if err := json.Unmarshal(bodyBytes, &newCfg); err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, h.ErrInvalidPayload.Error(), nil)
			return
		}

		// Sqlite lives in the data folder and needs nothing else
		if newCfg.GetDriver() == config.DatabaseSqlite {
			newCfg = config.DBConfig{Driver: config.DatabaseSqlite}
		} else if newCfg.SSLMode == "" {
			newCfg.SSLMode = "disable"
		}

		if err := database.TestConnection(newCfg); err != nil {
			logger.Warn("Database setup connection test failed: %s", err.Error())
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		if err := config.SaveDBConfig(newCfg); err != nil {
			logger.Error("DatabaseConfigSaveError", err)
			h.ResultErrorJSON(w, r, http.StatusInternalServerError, "Unable to save database configuration", nil)
			return
		}

		prevCfg := config.Configuration.DB
		config.Configuration.DB = newCfg
		logger.Info("Database configuration saved to %s", config.GetDBConfigFile())

		if err := onConfigured(); err != nil {
			logger.Error("DatabaseSetupError", err)
			// Roll back so the wizard can be attempted again
			database.Close()
			config.Configuration.DB = prevCfg
			if rmErr := config.RemoveDBConfig(); rmErr != nil {
				logger.Error("DatabaseConfigRemoveError", rmErr)
			}
			h.ResultErrorJSON(w, r, http.StatusInternalServerError, err.Error(), nil)
			return
		}

		h.ResultResponseJSON(w, r, http.StatusOK, true)
	}
}
