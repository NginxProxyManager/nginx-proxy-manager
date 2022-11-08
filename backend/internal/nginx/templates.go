package nginx

import (
	"fmt"
	"os"

	"npm/internal/entity/certificate"
	"npm/internal/entity/host"
	"npm/internal/logger"

	"github.com/aymerick/raymond"
)

// TemplateData is a struct
type TemplateData struct {
	ConfDir     string
	DataDir     string
	Host        host.Template
	Certificate certificate.Template
}

func generateHostConfig(template string, data TemplateData) (string, error) {
	return raymond.Render(template, data)
}

func writeTemplate(filename, template string, data TemplateData) error {
	output, err := generateHostConfig(template, data)
	if err != nil {
		output = fmt.Sprintf("# Template Error: %s", err.Error())
	}

	// Write it. This will also write an error comment if generation failed
	// nolint: gosec
	writeErr := writeConfigFile(filename, output)
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
