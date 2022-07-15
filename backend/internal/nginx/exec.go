package nginx

import (
	"fmt"
	"os/exec"

	"npm/internal/logger"
)

func reloadNginx() error {
	_, err := shExec([]string{"-s", "reload"})
	return err
}

func getNginxFilePath() (string, error) {
	path, err := exec.LookPath("nginx")
	if err != nil {
		return path, fmt.Errorf("Cannot find nginx execuatable script in PATH")
	}
	return path, nil
}

// shExec executes nginx with arguments
func shExec(args []string) (string, error) {
	ng, err := getNginxFilePath()
	if err != nil {
		logger.Error("NginxError", err)
		return "", err
	}

	logger.Debug("CMD: %s %v", ng, args)
	// nolint: gosec
	c := exec.Command(ng, args...)

	b, e := c.Output()

	if e != nil {
		logger.Error("NginxError", fmt.Errorf("Command error: %s -- %v\n%+v", ng, args, e))
		logger.Warn(string(b))
	}

	return string(b), e
}
