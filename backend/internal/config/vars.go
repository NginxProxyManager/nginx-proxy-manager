package config

import (
	"fmt"
	"strconv"
	"strings"

	"npm/internal/logger"
)

// Version is the version set by ldflags
var Version string

// Commit is the git commit set by ldflags
var Commit string

// IsDBSetup defines whether the database has been configured, connected
// to and migrated
var IsDBSetup bool

// IsSetup defines whether we have an admin user or not
var IsSetup bool

var logLevel logger.Level

// Configuration is the main configuration object
var Configuration struct {
	DataFolder  string   `json:"data_folder" envconfig:"optional,default=/data"`
	DisableIPV4 bool     `json:"disable_ipv4" envconfig:"optional"`
	DisableIPV6 bool     `json:"disable_ipv6" envconfig:"optional"`
	Acmesh      acmesh   `json:"acmesh"`
	DB          DBConfig `json:"db"`
	Log         log      `json:"log"`
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

// VersionSplit is a struct that holds the major, minor, and patch versions
type VersionSplit struct {
	Major uint `json:"major"`
	Minor uint `json:"minor"`
	Patch uint `json:"patch"`
}

// GetVersionSplit returns the major, minor, and patch versions
func GetVersionSplit() VersionSplit {
	bits := strings.Split(Version, ".")
	if len(bits) != 3 {
		return VersionSplit{Major: 0, Minor: 0, Patch: 0}
	}
	return VersionSplit{Major: parseUintOrZero(bits[0]), Minor: parseUintOrZero(bits[1]), Patch: parseUintOrZero(bits[2])}
}

// parseUintOrZero parses a string to a uint, returning zero on error
func parseUintOrZero(s string) uint {
	u, err := strconv.ParseUint(s, 10, 0)
	if err != nil {
		return 0
	}
	return uint(u)
}
