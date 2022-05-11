package config

import (
	"fmt"
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

// PublicKey is the public key
var PublicKey string

// PrivateKey is the private key
var PrivateKey string

var logLevel logger.Level

type log struct {
	Level  string `json:"level" envconfig:"optional,default=info"`
	Format string `json:"format" envconfig:"optional,default=nice"`
}

type acmesh struct {
	Home       string `json:"home" envconfig:"optional,default=/data/.acme.sh"`
	ConfigHome string `json:"config_home" envconfig:"optional,default=/data/.acme.sh/config"`
	CertHome   string `json:"cert_home" envconfig:"optional,default=/data/.acme.sh/certs"`
}

// Configuration is the main configuration object
var Configuration struct {
	DataFolder string `json:"data_folder" envconfig:"optional,default=/data"`
	Acmesh     acmesh `json:"acmesh"`
	Log        log    `json:"log"`
}

// GetWellknown returns the well known path
func (a *acmesh) GetWellknown() string {
	return fmt.Sprintf("%s/.well-known", a.Home)
}
