package config

import (
	"encoding/json"
	"os"
	"path/filepath"

	"npm/internal/logger"

	"github.com/rotisserie/eris"
)

const dbConfigFilename = "db.conf"

// GetDBConfigFile returns the path of the file the database
// connection parameters are persisted to
func GetDBConfigFile() string {
	return filepath.Join(Configuration.DataFolder, dbConfigFilename)
}

// LoadDBConfig populates the database configuration from the db.conf file,
// unless NPM_DB_DRIVER has been provided in which case the environment
// variables take precedence and the file is ignored. A missing file is not
// an error; the database simply remains unconfigured and the setup wizard
// will ask for it.
func LoadDBConfig() error {
	if Configuration.DB.IsConfigured() {
		logger.Info("Using database configuration from environment variables")
		return nil
	}

	file := GetDBConfigFile()
	// nolint: gosec
	content, err := os.ReadFile(file)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return eris.Wrapf(err, "unable to read %s", file)
	}

	cfg := Configuration.DB
	if err := json.Unmarshal(content, &cfg); err != nil {
		return eris.Wrapf(err, "unable to parse %s", file)
	}

	if !cfg.IsConfigured() {
		return eris.Errorf("%s does not specify a database driver", file)
	}

	Configuration.DB = cfg
	logger.Info("Using database configuration from %s", file)
	return nil
}

// SaveDBConfig writes the database connection parameters to the db.conf
// file. The file contains credentials so it is only readable by the owner.
// It is written to a temporary file first and renamed so that a crash
// can never leave a half written config behind.
func SaveDBConfig(cfg DBConfig) error {
	// Persisting the password is the point of this file
	// nolint: gosec
	content, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}

	file := GetDBConfigFile()
	tmp, err := os.CreateTemp(filepath.Dir(file), dbConfigFilename+".*")
	if err != nil {
		return eris.Wrapf(err, "unable to write %s", file)
	}
	// nolint: errcheck
	defer os.Remove(tmp.Name())

	if _, err := tmp.Write(content); err != nil {
		// nolint: errcheck, gosec
		tmp.Close()
		return eris.Wrapf(err, "unable to write %s", file)
	}
	if err := tmp.Close(); err != nil {
		return eris.Wrapf(err, "unable to write %s", file)
	}

	return os.Rename(tmp.Name(), file)
}

// RemoveDBConfig deletes the db.conf file, used to roll back a
// database setup that could not be completed
func RemoveDBConfig() error {
	err := os.Remove(GetDBConfigFile())
	if os.IsNotExist(err) {
		return nil
	}
	return err
}
