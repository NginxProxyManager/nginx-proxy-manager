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

var logLevel logger.Level

// Configuration is the main configuration object
var Configuration struct {
	DataFolder  string `json:"data_folder" envconfig:"optional,default=/data"`
	DisableIPV4 bool   `json:"disable_ipv4" envconfig:"optional"`
	DisableIPV6 bool   `json:"disable_ipv6" envconfig:"optional"`
	Acmesh      acmesh `json:"acmesh"`
	DB          db     `json:"db"`
	Log         log    `json:"log"`
}

type log struct {
	Level  string `json:"level" envconfig:"optional,default=info"`
	Format string `json:"format" envconfig:"optional,default=nice"`
}

type acmesh struct {
	Home       string `json:"home" envconfig:"optional,default=/data/.acme.sh"`
	ConfigHome string `json:"config_home" envconfig:"optional,default=/data/.acme.sh/config"`
	CertHome   string `json:"cert_home" envconfig:"optional,default=/data/.acme.sh/certs"`
}

// GetWellknown returns the well known path
func (a *acmesh) GetWellknown() string {
	return fmt.Sprintf("%s/.well-known", a.Home)
}
