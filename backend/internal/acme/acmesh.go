package acme

// Some light reading:
// https://github.com/acmesh-official/acme.sh/wiki/How-to-issue-a-cert

import (
	"fmt"
	"os"
	"os/exec"
	"strings"

	"npm/internal/config"
	"npm/internal/entity/certificateauthority"
	"npm/internal/entity/dnsprovider"
	"npm/internal/logger"

	"github.com/rotisserie/eris"
)

func getAcmeShFilePath() (string, error) {
	path, err := exec.LookPath("acme.sh")
	if err != nil {
		return path, eris.Wrapf(err, "Cannot find acme.sh execuatable script in PATH")
	}
	return path, nil
}

func getCommonEnvVars() []string {
	return []string{
		fmt.Sprintf("ACMESH_CONFIG_HOME=%s", os.Getenv("ACMESH_CONFIG_HOME")),
		fmt.Sprintf("ACMESH_HOME=%s", os.Getenv("ACMESH_HOME")),
		fmt.Sprintf("CERT_HOME=%s", os.Getenv("CERT_HOME")),
		fmt.Sprintf("LE_CONFIG_HOME=%s", os.Getenv("LE_CONFIG_HOME")),
		fmt.Sprintf("LE_WORKING_DIR=%s", os.Getenv("LE_WORKING_DIR")),
	}
}

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

// CreateAccountKey is required for each server initially
func CreateAccountKey(ca *certificateauthority.Model) error {
	args := []string{"--create-account-key", "--accountkeylength", "2048"}
	if ca != nil {
		logger.Info("Acme.sh CreateAccountKey for %s", ca.AcmeshServer)
		args = append(args, "--server", ca.AcmeshServer)
		if ca.CABundle != "" {
			args = append(args, "--ca-bundle", ca.CABundle)
		}
	} else {
		logger.Info("Acme.sh CreateAccountKey")
	}

	args = append(args, getCommonArgs()...)
	ret, err := shExec(args, nil)
	if err != nil {
		return err
	}

	logger.Debug("CreateAccountKey returned:\n%+v", ret)

	return nil
}

// RequestCert does all the heavy lifting
func RequestCert(domains []string, method, outputFullchainFile, outputKeyFile string, dnsProvider *dnsprovider.Model, ca *certificateauthority.Model, force bool) (string, error) {
	args, err := buildCertRequestArgs(domains, method, outputFullchainFile, outputKeyFile, dnsProvider, ca, force)
	if err != nil {
		return err.Error(), err
	}

	envs := make([]string, 0)
	if dnsProvider != nil {
		envs, err = dnsProvider.GetAcmeShEnvVars()
		if err != nil {
			return err.Error(), err
		}
	}

	ret, err := shExec(args, envs)
	if err != nil {
		return ret, err
	}

	return "", nil
}

// shExec executes the acme.sh with arguments
func shExec(args []string, envs []string) (string, error) {
	acmeSh, err := getAcmeShFilePath()
	if err != nil {
		logger.Error("AcmeShError", err)
		return "", err
	}

	logger.Debug("CMD: %s %v", acmeSh, args)
	// nolint: gosec
	c := exec.Command(acmeSh, args...)
	c.Env = append(getCommonEnvVars(), envs...)

	b, e := c.CombinedOutput()

	if e != nil {
		// logger.Error("AcmeShError", eris.Wrapf(e, "Command error: %s -- %v\n%+v", acmeSh, args, e))
		logger.Warn(string(b))
	}

	return string(b), e
}

func getCommonArgs() []string {
	args := make([]string, 0)

	if config.Configuration.Acmesh.Home != "" {
		args = append(args, "--home", config.Configuration.Acmesh.Home)
	}
	if config.Configuration.Acmesh.ConfigHome != "" {
		args = append(args, "--config-home", config.Configuration.Acmesh.ConfigHome)
	}
	if config.Configuration.Acmesh.CertHome != "" {
		args = append(args, "--cert-home", config.Configuration.Acmesh.CertHome)
	}

	args = append(args, "--log", "/data/logs/acme.sh.log")
	args = append(args, "--debug", "2")

	return args
}

// This is split out into it's own function so it's testable
func buildCertRequestArgs(
	domains []string,
	method,
	outputFullchainFile,
	outputKeyFile string,
	dnsProvider *dnsprovider.Model,
	ca *certificateauthority.Model,
	force bool,
) ([]string, error) {
	// The argument order matters.
	// see https://github.com/acmesh-official/acme.sh/wiki/How-to-issue-a-cert#3-multiple-domains-san-mode--hybrid-mode
	// for multiple domains and note that the method of validation is required just after the domain arg, each time.

	// TODO log file location configurable
	args := []string{"--issue"}

	if ca != nil {
		args = append(args, "--server", ca.AcmeshServer)
		if ca.CABundle != "" {
			args = append(args, "--ca-bundle", ca.CABundle)
		}
	}

	if outputFullchainFile != "" {
		args = append(args, "--fullchain-file", outputFullchainFile)
	}

	if outputKeyFile != "" {
		args = append(args, "--key-file", outputKeyFile)
	}

	methodArgs := make([]string, 0)
	switch method {
	case "dns":
		if dnsProvider == nil {
			return nil, ErrDNSNeedsDNSProvider
		}
		methodArgs = append(methodArgs, "--dns", dnsProvider.AcmeshName)
		if dnsProvider.DNSSleep > 0 {
			// See: https://github.com/acmesh-official/acme.sh/wiki/dnscheck
			methodArgs = append(methodArgs, "--dnssleep", fmt.Sprintf("%d", dnsProvider.DNSSleep))
		}

	case "http":
		if dnsProvider != nil {
			return nil, ErrHTTPHasDNSProvider
		}
		methodArgs = append(methodArgs, "-w", config.Configuration.Acmesh.GetWellknown())
	default:
		return nil, ErrMethodNotSupported
	}

	hasMethod := false

	// Add domains to args
	for _, domain := range domains {
		args = append(args, "-d", domain)
		// Method has to appear after each domain
		if !hasMethod {
			args = append(args, methodArgs...)
			hasMethod = true
		}
	}

	if force {
		args = append(args, "--force")
	}

	args = append(args, getCommonArgs()...)

	return args, nil
}
