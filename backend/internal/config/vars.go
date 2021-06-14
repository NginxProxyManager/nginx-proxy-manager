package config

import "npm/internal/logger"

// Version is the version set by ldflags
var Version string

// Commit is the git commit set by ldflags
var Commit string

// IsSetup defines whether we have an admin user or not
var IsSetup bool

// ErrorReporting defines whether we will send errors to Sentry
var ErrorReporting bool

// PublicKey ...
var PublicKey string

// PrivateKey ...
var PrivateKey string

var logLevel logger.Level

type log struct {
	Level  string `json:"level" envconfig:"optional,default=info"`
	Format string `json:"format" envconfig:"optional,default=nice"`
}

// Configuration ...
var Configuration struct {
	DataFolder string `json:"data_folder" envconfig:"optional,default=/data"`
	Log        log    `json:"log"`
}
