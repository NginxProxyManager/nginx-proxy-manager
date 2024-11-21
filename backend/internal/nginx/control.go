package nginx

import (
	"fmt"
	"os"

	"npm/internal/config"
	"npm/internal/entity/certificate"
	"npm/internal/entity/host"
	"npm/internal/entity/upstream"
	"npm/internal/logger"
	"npm/internal/status"
)

const (
	DeletedSuffix  = ".deleted"
	DisabledSuffix = ".disabled"
	ErrorSuffix    = ".error"
)

// ConfigureHost will attempt to write nginx conf and reload nginx
// When a host is disabled or deleted, it will name the file with a suffix
// that won't be used by nginx.
func ConfigureHost(h host.Model) error {
	// nolint: errcheck, gosec
	h.Expand([]string{"certificate", "nginxtemplate", "upstream"})

	var certificateTemplate certificate.Template
	if h.Certificate != nil {
		certificateTemplate = h.Certificate.GetTemplate()
	}

	var ups upstream.Model
	if h.Upstream != nil {
		ups = *h.Upstream
	}

	data := TemplateData{
		Certificate: certificateTemplate,
		ConfDir:     fmt.Sprintf("%s/nginx/hosts", config.Configuration.DataFolder),
		Config: Config{ // todo
			Ipv4: !config.Configuration.DisableIPV4,
			Ipv6: !config.Configuration.DisableIPV6,
		},
		DataDir:  config.Configuration.DataFolder,
		Host:     h.GetTemplate(),
		Upstream: ups,
	}

	removeHostFiles(h)
	filename := getHostFilename(h, "")
	// if h.IsDeleted {
	//	filename = getHostFilename(h, DeletedSuffix)
	// } else if h.IsDisabled {
	if h.IsDisabled {
		filename = getHostFilename(h, DisabledSuffix)
	}

	// Write the config to disk
	err := writeTemplate(filename, h.NginxTemplate.Template, data, "")
	if err != nil {
		// this configuration failed somehow
		h.Status = status.StatusError
		h.ErrorMessage = fmt.Sprintf("Template generation failed: %s", err.Error())
		logger.Debug(h.ErrorMessage)
		return h.Save(true)
	}

	// Reload Nginx and check for errors
	if output, err := reloadNginx(); err != nil {
		// reloading nginx failed, likely due to this host having a problem
		h.Status = status.StatusError
		h.ErrorMessage = fmt.Sprintf("Nginx configuation error: %s - %s", err.Error(), output)

		// Write the .error file, if this isn't a deleted or disabled host
		// as the reload will only fail because of this host, if it's enabled
		if !h.IsDisabled {
			filename = getHostFilename(h, ErrorSuffix)
			// Clear existing file(s) again
			removeHostFiles(h)
			// Write the template again, but with an error message at the end of the file
			// nolint: errcheck, gosec
			writeTemplate(filename, h.NginxTemplate.Template, data, h.ErrorMessage)
		}

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

	removeUpstreamFiles(u)
	filename := getUpstreamFilename(u, "")
	// if u.IsDeleted {
	// 	filename = getUpstreamFilename(u, DeletedSuffix)
	// }

	// Write the config to disk
	err := writeTemplate(filename, u.NginxTemplate.Template, data, "")
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

		// Write the .error file, if this isn't a deleted upstream
		// as the reload will only fail because of this upstream
		// if !u.IsDeleted {
		filename = getUpstreamFilename(u, ErrorSuffix)
		// Clear existing file(s) again
		removeUpstreamFiles(u)
		// Write the template again, but with an error message at the end of the file
		// nolint: errcheck, gosec
		writeTemplate(filename, u.NginxTemplate.Template, data, u.ErrorMessage)
		// }

		logger.Debug(u.ErrorMessage)
	} else {
		// All good
		u.Status = status.StatusOK
		u.ErrorMessage = ""
		logger.Debug("ConfigureUpstream OK: %+v", u)
	}

	return u.Save(true)
}

func getHostFilename(h host.Model, appends string) string {
	confDir := fmt.Sprintf("%s/nginx/hosts", config.Configuration.DataFolder)
	return fmt.Sprintf("%s/host_%d.conf%s", confDir, h.ID, appends)
}

func getUpstreamFilename(u upstream.Model, appends string) string {
	confDir := fmt.Sprintf("%s/nginx/upstreams", config.Configuration.DataFolder)
	return fmt.Sprintf("%s/upstream_%d.conf%s", confDir, u.ID, appends)
}

func removeHostFiles(h host.Model) {
	removeFiles([]string{
		getHostFilename(h, ""),
		getHostFilename(h, DeletedSuffix),
		getHostFilename(h, DisabledSuffix),
		getHostFilename(h, ErrorSuffix),
	})
}

func removeUpstreamFiles(u upstream.Model) {
	removeFiles([]string{
		getUpstreamFilename(u, ""),
		getUpstreamFilename(u, DeletedSuffix),
		getUpstreamFilename(u, ErrorSuffix),
	})
}

func removeFiles(files []string) {
	for _, file := range files {
		if _, err := os.Stat(file); err == nil {
			// nolint: errcheck, gosec
			os.Remove(file)
		}
	}
}

// GetHostConfigContent returns nginx config as it exists on disk
func GetHostConfigContent(h host.Model) (string, error) {
	filename := getHostFilename(h, "")
	if h.ErrorMessage != "" {
		filename = getHostFilename(h, ErrorSuffix)
	}
	if h.IsDisabled {
		filename = getHostFilename(h, DisabledSuffix)
	}
	// if h.IsDeleted {
	// 	filename = getHostFilename(h, DeletedSuffix)
	// }

	// nolint: gosec
	cnt, err := os.ReadFile(filename)
	if err != nil {
		return "", err
	}
	return string(cnt), nil
}

// GetUpstreamConfigContent returns nginx config as it exists on disk
func GetUpstreamConfigContent(u upstream.Model) (string, error) {
	filename := getUpstreamFilename(u, "")
	if u.ErrorMessage != "" {
		filename = getUpstreamFilename(u, ErrorSuffix)
	}
	// if u.IsDeleted {
	// 	filename = getUpstreamFilename(u, DeletedSuffix)
	// }

	// nolint: gosec
	cnt, err := os.ReadFile(filename)
	if err != nil {
		return "", err
	}
	return string(cnt), nil
}
