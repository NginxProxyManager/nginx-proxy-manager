package config

import (
	"npm/internal/logger"
)

// Version is the version set by ldflags
var Version string

// Commit is the git commit set by ldflags
var Commit string

// IsSetup defines whether we have an admin user or not
var IsSetup bool

// ErrorReporting defines whether we will send errors to Sentry
var ErrorReporting bool

var logLevel logger.Level

type log struct {
	Level  string `json:"level" envconfig:"optional,default=info"`
	Format string `json:"format" envconfig:"optional,default=nice"`
}

// Configuration is the main configuration object
var Configuration struct {
	DataFolder  string `json:"data_folder" envconfig:"optional,default=/data"`
	DisableIPV4 bool   `json:"disable_ipv4" envconfig:"optional"`
	DisableIPV6 bool   `json:"disable_ipv6" envconfig:"optional"`
	Acmesh      acmesh `json:"acmesh"`
	DB          db     `json:"db"`
	Log         log    `json:"log"`
}
