package config

import (
	"fmt"
	"os"

	"npm/internal/logger"
)

// CreateDataFolders will recursively create these folders within the
// data folder defined in configuration.
func CreateDataFolders() {
	folders := []string{
		"access",
		"certificates",
		"logs",
		// Acme.sh:
		Configuration.Acmesh.GetWellknown(),
		// Nginx:
		"nginx/hosts",
		"nginx/streams",
		"nginx/temp",
		"nginx/upstreams",
	}

	for _, folder := range folders {
		path := folder
		if path[0:1] != "/" {
			path = fmt.Sprintf("%s/%s", Configuration.DataFolder, folder)
		}
		logger.Debug("Creating folder: %s", path)
		if err := os.MkdirAll(path, os.ModePerm); err != nil {
			logger.Error("CreateDataFolderError", err)
		}
	}
}
