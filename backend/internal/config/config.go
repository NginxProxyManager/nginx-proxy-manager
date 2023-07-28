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

	initLogger()
}

// InitIPRanges will initialise the config for the ipranges command
func InitIPRanges(version, commit *string) error {
	Version = *version
	Commit = *commit
	err := envconfig.InitWithPrefix(&Configuration, "NPM")
	initLogger()
	return err
}

// Init initialises the Log object and return it
func initLogger() {
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

	err := logger.Configure(&logger.Config{
		LogThreshold: logLevel,
		Formatter:    Configuration.Log.Format,
	})

	if err != nil {
		logger.Error("LoggerConfigurationError", err)
	}
}

// GetLogLevel returns the logger const level
func GetLogLevel() logger.Level {
	return logLevel
}
