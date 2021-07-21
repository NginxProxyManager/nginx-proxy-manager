package nginx

import (
	"io/fs"
	"io/ioutil"

	"npm/embed"

	"github.com/aymerick/raymond"
)

// WriteTemplate will load, parse and write a template file
func WriteTemplate(templateName, outputFilename string, data map[string]interface{}) error {
	// get template file content
	subFs, _ := fs.Sub(embed.NginxFiles, "nginx")
	template, err := fs.ReadFile(subFs, templateName)

	if err != nil {
		return err
	}

	// Render
	parsedFile, err := raymond.Render(string(template), data)
	if err != nil {
		return err
	}

	// Write it
	// nolint: gosec
	return ioutil.WriteFile(outputFilename, []byte(parsedFile), 0644)
}
