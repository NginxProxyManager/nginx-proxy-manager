package config

import (
	"fmt"
	golog "log"

	"npm/internal/logger"

	"github.com/vrischmann/envconfig"
)

// Init will parse environment variables into the Env struct
func Init(version, commit *string) {
	Version = *version
	Commit = *commit

	if err := envconfig.InitWithPrefix(&Configuration, "NPM"); err != nil {
		fmt.Printf("%+v\n", err)
	}

	if err := initLogger(); err != nil {
		logger.Error("LoggerConfigurationError", err)
	}
}

// InitIPRanges will initialise the config for the ipranges command
func InitIPRanges(version, commit *string) error {
	Version = *version
	Commit = *commit
	err := envconfig.InitWithPrefix(&Configuration, "NPM")
	// nolint: errcheck, gosec
	initLogger()
	return err
}

// Init initialises the Log object and return it
func initLogger() error {
	// this removes timestamp prefixes from logs
	golog.SetFlags(0)

	switch Configuration.Log.Level {
	case "debug":
		logLevel = logger.DebugLevel
	case "warn":
		logLevel = logger.WarnLevel
	case "error":
		logLevel = logger.ErrorLevel
	default:
		logLevel = logger.InfoLevel
	}

	return logger.Configure(&logger.Config{
		LogThreshold: logLevel,
		Formatter:    Configuration.Log.Format,
	})
}

// GetLogLevel returns the logger const level
func GetLogLevel() logger.Level {
	return logLevel
}
