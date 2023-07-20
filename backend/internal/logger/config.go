package logger

// Level type
type Level int

// Log level definitions
const (
	// DebugLevel usually only enabled when debugging. Very verbose logging.
	DebugLevel Level = 10
	// InfoLevel general operational entries about what's going on inside the application.
	InfoLevel Level = 20
	// WarnLevel non-critical entries that deserve eyes.
	WarnLevel Level = 30
	// ErrorLevel used for errors that should definitely be noted.
	ErrorLevel Level = 40
)

// Config options for the logger.
type Config struct {
	LogThreshold Level
	Formatter    string
}

// Interface for a logger
type Interface interface {
	GetLogLevel() Level
	Debug(format string, args ...interface{})
	Info(format string, args ...interface{})
	Warn(format string, args ...interface{})
	Error(errorClass string, err error, args ...interface{})
	Errorf(errorClass, format string, err error, args ...interface{})
}

// ConfigurableLogger is an interface for a logger that can be configured
type ConfigurableLogger interface {
	Configure(c *Config) error
}
