package nginx

import "npm/internal/entity/host"

// ConfigureHost will attempt to write nginx conf and reload nginx
func ConfigureHost(h host.Model) error {
	// nolint: errcheck, gosec
	h.Expand([]string{"certificate"})

	// nolint: errcheck, gosec
	reloadNginx()
	return nil
}
