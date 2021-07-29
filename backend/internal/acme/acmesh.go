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
	if r, err := shExec("--version"); err == nil {
		// modify the output
		r = strings.Trim(r, "\n")
		v := strings.Split(r, "\n")
		return v[len(v)-1]
	}
	return ""
}

// shExec executes the acme.sh with arguments
func shExec(args ...string) (string, error) {
	if _, err := os.Stat(acmeShFile); os.IsNotExist(err) {
		e := fmt.Errorf("%s does not exist", acmeShFile)
		logger.Error("AcmeShError", e)
		return "", e
	}

	logger.Debug("CMD: %s %v", acmeShFile, args)
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

// RequestCert does all the heavy lifting
func RequestCert(domains []string, method string) error {
	args := []string{"--issue"}

	webroot := "/home/wwwroot/example.com"

	// Add domains to args
	for _, domain := range domains {
		args = append(args, "-d", domain)
	}

	switch method {
	// case "dns":
	case "http":
		args = append(args, "-w", webroot)

	default:
		return fmt.Errorf("RequestCert method not supported: %s", method)
	}

	ret, err := shExec(args...)
	if err != nil {
		return err
	}

	logger.Debug("ret: %+v", ret)

	return nil
}
