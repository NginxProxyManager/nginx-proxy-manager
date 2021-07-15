package acme

import (
	"fmt"
	"io/ioutil"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"npm/embed"
	"npm/internal/config"
	"npm/internal/logger"
)

var acmeShFile string

// GetAcmeShVersion will return the acme.sh script version
func GetAcmeShVersion() string {
	if r, err := acmeShExec("--version"); err == nil {
		// modify the output
		r = strings.Trim(r, "\n")
		v := strings.Split(r, "\n")
		return v[len(v)-1]
	}
	return ""
}

func acmeShExec(args ...string) (string, error) {
	if _, err := os.Stat(acmeShFile); os.IsNotExist(err) {
		e := fmt.Errorf("%s does not exist", acmeShFile)
		logger.Error("AcmeShError", e)
		return "", e
	}

	// nolint: gosec
	c := exec.Command(acmeShFile, args...)
	b, e := c.Output()

	if e != nil {
		logger.Error("AcmeShError", fmt.Errorf("Command error: %s -- %v\n%+v", acmeShFile, args, e))
		logger.Warn(string(b))
	}

	return string(b), e
}

// WriteAcmeSh this will write our embedded acme.sh script to the data directory
// and give it write permissions
func WriteAcmeSh() {
	if config.Configuration.DataFolder == "" {
		logger.Error("AcmeShWriteError", fmt.Errorf("Configuration folder location is not set"))
		return
	}

	acmeShFile = filepath.Clean(fmt.Sprintf("%s/acme.sh", config.Configuration.DataFolder))
	// nolint: gosec
	if err := ioutil.WriteFile(acmeShFile, []byte(embed.AcmeSh), 0755); err != nil {
		logger.Error("AcmeShWriteError", err)
	} else {
		logger.Info("Wrote %s", acmeShFile)
	}
}
