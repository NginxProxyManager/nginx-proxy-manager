package nginx

import (
	"os/exec"

	"npm/internal/logger"

	"github.com/rotisserie/eris"
)

func reloadNginx() (string, error) {
	return shExec([]string{"-s", "reload"})
}

func getNginxFilePath() (string, error) {
	path, err := exec.LookPath("nginx")
	if err != nil {
		return path, eris.Wrapf(err, "Cannot find nginx execuatable script in PATH")
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

	b, e := c.CombinedOutput()
	if e != nil {
		logger.Error("NginxError", eris.Wrapf(e, "Command error: %s -- %v\n%+v", ng, args, e))
		logger.Warn(string(b))
	}

	return string(b), e
}
