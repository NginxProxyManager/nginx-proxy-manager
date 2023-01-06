package nginx

import (
	"fmt"
	"os"

	"npm/internal/entity/certificate"
	"npm/internal/entity/host"
	"npm/internal/entity/upstream"
	"npm/internal/logger"
	"npm/internal/util"

	"github.com/aymerick/raymond"
)

type Config struct {
	Ipv4 bool
	Ipv6 bool
}

// TemplateData is a struct
type TemplateData struct {
	ConfDir     string
	Config      Config
	DataDir     string
	Host        host.Template
	Certificate certificate.Template
	Upstream    upstream.Model
}

func renderTemplate(template string, data TemplateData) (string, error) {
	logger.Debug("Rendering Template - Template: %s", template)
	logger.Debug("Rendering Template - Data: %+v", data)
	return raymond.Render(template, data)
}

func writeTemplate(filename, template string, data TemplateData) error {
	output, err := renderTemplate(template, data)
	if err != nil {
		output = fmt.Sprintf("# Template Error: %s", err.Error())
	}

	// Write it. This will also write an error comment if generation failed
	// nolint: gosec
	writeErr := writeConfigFile(filename, util.CleanupWhitespace(output))
	if err != nil {
		return err
	}
	return writeErr
}

func writeConfigFile(filename, content string) error {
	logger.Debug("Writing %s with:\n%s", filename, content)
	// nolint: gosec
	return os.WriteFile(filename, []byte(content), 0644)
}
