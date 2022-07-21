package nginx

import (
	"fmt"

	"npm/internal/config"
	"npm/internal/entity/host"
	"npm/internal/logger"
)

// ConfigureHost will attempt to write nginx conf and reload nginx
func ConfigureHost(h host.Model) error {
	// nolint: errcheck, gosec
	h.Expand([]string{"certificate", "hosttemplate"})

	data := TemplateData{
		ConfDir:     fmt.Sprintf("%s/nginx/hosts", config.Configuration.DataFolder),
		DataDir:     config.Configuration.DataFolder,
		CertsDir:    config.Configuration.Acmesh.CertHome,
		Host:        &h,
		Certificate: h.Certificate,
	}

	filename := fmt.Sprintf("%s/host_%d.conf", data.ConfDir, h.ID)

	// Write the config to disk
	err := writeTemplate(filename, h.HostTemplate.Template, data)
	if err != nil {
		// this configuration failed somehow
		h.Status = host.StatusError
		h.ErrorMessage = fmt.Sprintf("Template generation failed: %s", err.Error())
		logger.Debug(h.ErrorMessage)
		return h.Save(true)
	}

	// nolint: errcheck, gosec
	if err := reloadNginx(); err != nil {
		// reloading nginx failed, likely due to this host having a problem
		h.Status = host.StatusError
		h.ErrorMessage = fmt.Sprintf("Nginx configuation error: %s", err.Error())
		writeConfigFile(filename, fmt.Sprintf("# %s", h.ErrorMessage))
		logger.Debug(h.ErrorMessage)
	} else {
		// All good
		h.Status = host.StatusOK
		h.ErrorMessage = ""
		logger.Debug("ConfigureHost OK: %+v", h)
	}

	return h.Save(true)
}
