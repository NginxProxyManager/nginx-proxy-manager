package services

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"text/template"
)

// NginxConfigService handles generation of Nginx configurations from templates
type NginxConfigService struct {
	templates *template.Template
}

// NewNginxConfigService creates a new config service and parses the templates
func NewNginxConfigService(templateDir string) (*NginxConfigService, error) {
	funcMap := template.FuncMap{
		"nginxAccessRule": func(client map[string]interface{}) string {
			address, _ := client["address"].(string)
			directive, _ := client["directive"].(string)
			return fmt.Sprintf("%s %s;", directive, address)
		},
		"join": func(arr []string, sep string) string {
			return strings.Join(arr, sep)
		},
	}

	// Parse all .conf files in the template directory
	pattern := filepath.Join(templateDir, "*.conf")
	t, err := template.New("nginx").Funcs(funcMap).ParseGlob(pattern)
	if err != nil {
		return nil, fmt.Errorf("failed to parse templates in %s: %w", templateDir, err)
	}

	return &NginxConfigService{
		templates: t,
	}, nil
}

// GenerateConfig generated a config string based on the given template name and data
func (s *NginxConfigService) GenerateConfig(templateName string, data interface{}) (string, error) {
	var buf bytes.Buffer

	// Execute the specific template
	err := s.templates.ExecuteTemplate(&buf, templateName, data)
	if err != nil {
		return "", fmt.Errorf("failed to execute template %s: %w", templateName, err)
	}

	return buf.String(), nil
}

// WriteConfig generates a configuration and writes it to a file
func (s *NginxConfigService) WriteConfig(templateName string, data interface{}, targetPath string) error {
	configStr, err := s.GenerateConfig(templateName, data)
	if err != nil {
		return err
	}

	// Ensure the target directory exists
	dir := filepath.Dir(targetPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create directory %s: %w", dir, err)
	}

	// Write the configuration file
	if err := os.WriteFile(targetPath, []byte(configStr), 0644); err != nil {
		return fmt.Errorf("failed to write config to %s: %w", targetPath, err)
	}

	return nil
}
