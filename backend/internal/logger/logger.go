package logger

import (
	"encoding/json"
	"fmt"
	stdlog "log"
	"os"
	"runtime/debug"
	"sync"
	"time"

	"github.com/fatih/color"
	"github.com/rotisserie/eris"
)

var colorReset, colorGray, colorYellow, colorBlue, colorRed, colorMagenta, colorBlack, colorWhite *color.Color

// Log message structure.
type Log struct {
	Timestamp  string   `json:"timestamp"`
	Level      string   `json:"level"`
	Message    string   `json:"message"`
	Pid        int      `json:"pid"`
	Summary    string   `json:"summary,omitempty"`
	Caller     string   `json:"caller,omitempty"`
	StackTrace []string `json:"stack_trace,omitempty"`
}

// Logger instance
type Logger struct {
	Config
	mux sync.Mutex
}

// global logging configuration.
var logger = NewLogger()

// NewLogger creates a new logger instance
func NewLogger() *Logger {
	color.NoColor = false
	colorReset = color.New(color.Reset)
	colorGray = color.New(color.FgWhite)
	colorYellow = color.New(color.Bold, color.FgYellow)
	colorBlue = color.New(color.Bold, color.FgBlue)
	colorRed = color.New(color.Bold, color.FgRed)
	colorMagenta = color.New(color.Bold, color.FgMagenta)
	colorBlack = color.New(color.Bold, color.FgBlack)
	colorWhite = color.New(color.Bold, color.FgWhite)

	return &Logger{
		Config: NewConfig(),
	}
}

// NewConfig returns the default config
func NewConfig() Config {
	return Config{
		LogThreshold: InfoLevel,
		Formatter:    "json",
	}
}

// Configure logger and will return error if missing required fields.
func Configure(c *Config) error {
	return logger.Configure(c)
}

// GetLogLevel currently configured
func GetLogLevel() Level {
	return logger.GetLogLevel()
}

// Debug logs if the log level is set to DebugLevel or below. Arguments are handled in the manner of fmt.Printf.
func Debug(format string, args ...interface{}) {
	logger.Debug(format, args...)
}

// Info logs if the log level is set to InfoLevel or below. Arguments are handled in the manner of fmt.Printf.
func Info(format string, args ...interface{}) {
	logger.Info(format, args...)
}

// Warn logs if the log level is set to WarnLevel or below. Arguments are handled in the manner of fmt.Printf.
func Warn(format string, args ...interface{}) {
	logger.Warn(format, args...)
}

// Error logs error given if the log level is set to ErrorLevel or below. Arguments are not logged.
// Attempts to log to bugsang.
func Error(errorClass string, err error) {
	logger.Error(errorClass, err)
}

// Get returns the logger
func Get() *Logger {
	return logger
}

// Configure logger and will return error if missing required fields.
func (l *Logger) Configure(c *Config) error {
	// ensure updates to the config are atomic
	l.mux.Lock()
	defer l.mux.Unlock()

	if c == nil {
		return eris.Errorf("a non nil Config is mandatory")
	}

	if err := c.LogThreshold.validate(); err != nil {
		return err
	}

	l.LogThreshold = c.LogThreshold
	l.Formatter = c.Formatter

	stdlog.SetFlags(0) // this removes timestamp prefixes from logs
	return nil
}

// validate the log level is in the accepted list.
func (l Level) validate() error {
	switch l {
	case DebugLevel, InfoLevel, WarnLevel, ErrorLevel:
		return nil
	default:
		return eris.Errorf("invalid \"Level\" %d", l)
	}
}

var logLevels = map[Level]string{
	DebugLevel: "DEBUG",
	InfoLevel:  "INFO",
	WarnLevel:  "WARN",
	ErrorLevel: "ERROR",
}

func (l *Logger) logLevel(logLevel Level, format string, args ...interface{}) {
	if logLevel < l.LogThreshold {
		return
	}

	errorClass := ""
	if logLevel == ErrorLevel {
		// First arg is the errorClass
		errorClass = args[0].(string)
		if len(args) > 1 {
			args = args[1:]
		} else {
			args = []interface{}{}
		}
	}

	stringMessage := fmt.Sprintf(format, args...)

	if l.Formatter == "json" {
		// JSON Log Format
		jsonLog, _ := json.Marshal(
			Log{
				Timestamp: time.Now().Format(time.RFC3339Nano),
				Level:     logLevels[logLevel],
				Message:   stringMessage,
				Pid:       os.Getpid(),
			},
		)

		stdlog.Println(string(jsonLog))
	} else {
		// Nice Log Format
		var colorLevel *color.Color
		switch logLevel {
		case DebugLevel:
			colorLevel = colorMagenta
		case InfoLevel:
			colorLevel = colorBlue
		case WarnLevel:
			colorLevel = colorYellow
		case ErrorLevel:
			colorLevel = colorRed
			stringMessage = fmt.Sprintf("%s: %s", errorClass, stringMessage)
		}

		t := time.Now()
		stdlog.Println(
			colorBlack.Sprint("["),
			colorWhite.Sprint(t.Format("2006-01-02 15:04:05")),
			colorBlack.Sprint("] "),
			colorLevel.Sprintf("%-8v", logLevels[logLevel]),
			colorGray.Sprint(stringMessage),
			colorReset.Sprint(""),
		)

		if logLevel == ErrorLevel && l.LogThreshold == DebugLevel {
			// Print a stack trace too
			debug.PrintStack()
		}
	}
}

// GetLogLevel currently configured
func (l *Logger) GetLogLevel() Level {
	return l.LogThreshold
}

// Debug logs if the log level is set to DebugLevel or below. Arguments are handled in the manner of fmt.Printf.
func (l *Logger) Debug(format string, args ...interface{}) {
	l.logLevel(DebugLevel, format, args...)
}

// Info logs if the log level is set to InfoLevel or below. Arguments are handled in the manner of fmt.Printf.
func (l *Logger) Info(format string, args ...interface{}) {
	l.logLevel(InfoLevel, format, args...)
}

// Warn logs if the log level is set to WarnLevel or below. Arguments are handled in the manner of fmt.Printf.
func (l *Logger) Warn(format string, args ...interface{}) {
	l.logLevel(WarnLevel, format, args...)
}

// Error logs error given if the log level is set to ErrorLevel or below. Arguments are not logged.
// Attempts to log to bugsang.
func (l *Logger) Error(errorClass string, err error) {
	l.logLevel(ErrorLevel, err.Error(), errorClass)
}
