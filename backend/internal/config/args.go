package config

import (
	"fmt"
	"os"

	"github.com/alexflint/go-arg"
)

// ArgConfig is the settings for passing arguments to the command
type ArgConfig struct {
	Version bool `arg:"-v" help:"print version and exit"`
}

var (
	appArguments ArgConfig
)

// InitArgs will parse arg vars
func InitArgs(version, commit *string) {
	// nolint: errcheck, gosec
	arg.MustParse(&appArguments)

	if appArguments.Version {
		fmt.Printf("v%s (%s)\n", *version, *commit)
		os.Exit(0)
	}
}
