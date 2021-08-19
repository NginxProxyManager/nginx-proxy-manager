package acme

// Some light reading:
// https://github.com/acmesh-official/acme.sh/wiki/How-to-issue-a-cert

import (
	"fmt"
	"io/ioutil"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"npm/embed"
	"npm/internal/config"
	"npm/internal/entity/dnsprovider"
	"npm/internal/logger"
)

var acmeShFile string

// GetAcmeShVersion will return the acme.sh script version
func GetAcmeShVersion() string {
	if r, err := shExec([]string{"--version"}, nil); err == nil {
		// modify the output
		r = strings.Trim(r, "\n")
		v := strings.Split(r, "\n")
		return v[len(v)-1]
	}
	return ""
}

// shExec executes the acme.sh with arguments
func shExec(args []string, envs []string) (string, error) {
	if _, err := os.Stat(acmeShFile); os.IsNotExist(err) {
		e := fmt.Errorf("%s does not exist", acmeShFile)
		logger.Error("AcmeShError", e)
		return "", e
	}

	logger.Debug("CMD: %s %v", acmeShFile, args)
	// nolint: gosec
	c := exec.Command(acmeShFile, args...)
	c.Env = envs

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
func RequestCert(domains []string, method, caBundle, outputFullchainFile, outputKeyFile string, dnsProvider *dnsprovider.Model) error {
	// TODO log file location configurable
	args, err := buildCertRequestArgs(domains, method, caBundle, outputFullchainFile, outputKeyFile, dnsProvider)
	if err != nil {
		return err
	}

	envs := make([]string, 0)
	if dnsProvider != nil {
		envs, err = dnsProvider.GetAcmeShEnvVars()
		if err != nil {
			return err
		}
	}

	ret, err := shExec(args, envs)
	if err != nil {
		return err
	}

	logger.Debug("ret: %+v", ret)

	return nil
}

// This is split out into it's own function so it's testable
func buildCertRequestArgs(domains []string, method, caBundle, outputFullchainFile, outputKeyFile string, dnsProvider *dnsprovider.Model) ([]string, error) {
	// TODO log file location configurable
	args := []string{"--issue", "--log", "/data/logs/acme.sh.log"}

	if caBundle != "" {
		args = append(args, "--ca-bundle", caBundle)
	}

	if outputFullchainFile != "" {
		args = append(args, "--fullchain-file", outputFullchainFile)
	}

	if outputKeyFile != "" {
		args = append(args, "--key-file", outputKeyFile)
	}

	// TODO webroot location configurable
	webroot := "/data/acme/wellknown"

	methodArgs := make([]string, 0)
	switch method {
	case "dns":
		if dnsProvider == nil {
			return nil, ErrDNSNeedsDNSProvider
		}
		methodArgs = append(methodArgs, "--dns", dnsProvider.AcmeShName)

	case "http":
		if dnsProvider != nil {
			return nil, ErrHTTPHasDNSProvider
		}
		methodArgs = append(methodArgs, "-w", webroot)
	default:
		return nil, ErrMethodNotSupported
	}

	hasMethod := false

	// Add domains to args
	for _, domain := range domains {
		args = append(args, "-d", domain)
		// Method has to appear after first domain, but does not need to be repeated
		// for other domains.
		if !hasMethod {
			args = append(args, methodArgs...)
			hasMethod = true
		}
	}

	return args, nil
}
