package config

import (
	"fmt"
	golog "log"
	"runtime"

	"npm/internal/logger"

	"github.com/getsentry/sentry-go"
	"github.com/vrischmann/envconfig"
)

// Init will parse environment variables into the Env struct
func Init(version, commit, sentryDSN *string) {
	// ErrorReporting is enabled until we load the status of it from the DB later
	ErrorReporting = true

	Version = *version
	Commit = *commit

	if err := envconfig.Init(&Configuration); err != nil {
		fmt.Printf("%+v\n", err)
	}

	initLogger(*sentryDSN)
	logger.Info("Build Version: %s (%s)", Version, Commit)
	loadKeys()
}

// Init initialises the Log object and return it
func initLogger(sentryDSN string) {
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
		SentryConfig: sentry.ClientOptions{
			// This is the jc21 NginxProxyManager Sentry project,
			// errors will be reported here (if error reporting is enable)
			// and this project is private. No personal information should
			// be sent in any error messages, only stacktraces.
			Dsn:         sentryDSN,
			Release:     Commit,
			Dist:        Version,
			Environment: fmt.Sprintf("%s-%s", runtime.GOOS, runtime.GOARCH),
		},
	})

	if err != nil {
		logger.Error("LoggerConfigurationError", err)
	}
}

// GetLogLevel returns the logger const level
func GetLogLevel() logger.Level {
	return logLevel
}

func isError(errorClass string, err error) bool {
	if err != nil {
		logger.Error(errorClass, err)
		return true
	}
	return false
}
