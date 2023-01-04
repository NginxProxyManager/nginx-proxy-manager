package nginx

import (
	"fmt"

	"npm/internal/config"
	"npm/internal/entity/certificate"
	"npm/internal/entity/host"
	"npm/internal/entity/upstream"
	"npm/internal/logger"
	"npm/internal/status"
)

// ConfigureHost will attempt to write nginx conf and reload nginx
func ConfigureHost(h host.Model) error {
	// nolint: errcheck, gosec
	h.Expand([]string{"certificate", "nginxtemplate"})

	var certificateTemplate certificate.Template
	if h.Certificate != nil {
		certificateTemplate = h.Certificate.GetTemplate()
	}

	data := TemplateData{
		ConfDir:     fmt.Sprintf("%s/nginx/hosts", config.Configuration.DataFolder),
		DataDir:     config.Configuration.DataFolder,
		Host:        h.GetTemplate(),
		Certificate: certificateTemplate,
	}

	filename := fmt.Sprintf("%s/host_%d.conf", data.ConfDir, h.ID)

	// Write the config to disk
	err := writeTemplate(filename, h.NginxTemplate.Template, data)
	if err != nil {
		// this configuration failed somehow
		h.Status = status.StatusError
		h.ErrorMessage = fmt.Sprintf("Template generation failed: %s", err.Error())
		logger.Debug(h.ErrorMessage)
		return h.Save(true)
	}

	// nolint: errcheck, gosec
	if output, err := reloadNginx(); err != nil {
		// reloading nginx failed, likely due to this host having a problem
		h.Status = status.StatusError
		h.ErrorMessage = fmt.Sprintf("Nginx configuation error: %s - %s", err.Error(), output)
		writeConfigFile(filename, fmt.Sprintf("# %s", h.ErrorMessage))
		logger.Debug(h.ErrorMessage)
	} else {
		// All good
		h.Status = status.StatusOK
		h.ErrorMessage = ""
		logger.Debug("ConfigureHost OK: %+v", h)
	}

	return h.Save(true)
}

// ConfigureUpstream will attempt to write nginx conf and reload nginx
func ConfigureUpstream(u upstream.Model) error {
	logger.Debug("ConfigureUpstream: %+v)", u)

	// nolint: errcheck, gosec
	u.Expand([]string{"nginxtemplate"})

	data := TemplateData{
		ConfDir:  fmt.Sprintf("%s/nginx/upstreams", config.Configuration.DataFolder),
		DataDir:  config.Configuration.DataFolder,
		Upstream: u,
	}

	filename := fmt.Sprintf("%s/upstream_%d.conf", data.ConfDir, u.ID)

	// Write the config to disk
	err := writeTemplate(filename, u.NginxTemplate.Template, data)
	if err != nil {
		// this configuration failed somehow
		u.Status = status.StatusError
		u.ErrorMessage = fmt.Sprintf("Template generation failed: %s", err.Error())
		logger.Debug(u.ErrorMessage)
		return u.Save(true)
	}

	// nolint: errcheck, gosec
	if output, err := reloadNginx(); err != nil {
		// reloading nginx failed, likely due to this host having a problem
		u.Status = status.StatusError
		u.ErrorMessage = fmt.Sprintf("Nginx configuation error: %s - %s", err.Error(), output)
		writeConfigFile(filename, fmt.Sprintf("# %s", u.ErrorMessage))
		logger.Debug(u.ErrorMessage)
	} else {
		// All good
		u.Status = status.StatusOK
		u.ErrorMessage = ""
		logger.Debug("ConfigureUpstream OK: %+v", u)
	}

	return u.Save(true)
}
