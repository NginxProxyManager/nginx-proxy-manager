package validator

import (
	"fmt"

	"npm/internal/entity/certificate"
	"npm/internal/entity/host"
	"npm/internal/entity/nginxtemplate"
	"npm/internal/entity/upstream"
)

// ValidateHost will check if associated objects exist and other checks
// will return  a nil error if things are OK
func ValidateHost(h host.Model) error {
	if h.CertificateID > 0 {
		// Check certificate exists and is valid
		// This will not determine if the certificate is Ready to use,
		// as this validation only cares that the row exists.
		if _, cErr := certificate.GetByID(h.CertificateID); cErr != nil {
			return fmt.Errorf("Certificate #%d does not exist", h.CertificateID)
		}
	}

	if h.UpstreamID > 0 {
		// Check upstream exists
		if _, uErr := upstream.GetByID(h.UpstreamID); uErr != nil {
			return fmt.Errorf("Upstream #%d does not exist", h.UpstreamID)
		}
	}

	// Ensure either UpstreamID is set or appropriate proxy host params are set
	if h.UpstreamID > 0 && (h.ProxyHost != "" || h.ProxyPort > 0) {
		return fmt.Errorf("Proxy Host or Port cannot be set when using an Upstream")
	}
	if h.UpstreamID == 0 && (h.ProxyHost == "" || h.ProxyPort < 1) {
		return fmt.Errorf("Proxy Host and Port must be specified, unless using an Upstream")
	}

	// Check the nginx template exists and has the same type.
	nginxTemplate, tErr := nginxtemplate.GetByID(h.NginxTemplateID)
	if tErr != nil {
		return fmt.Errorf("Host Template #%d does not exist", h.NginxTemplateID)
	}
	if nginxTemplate.Type != h.Type {
		return fmt.Errorf("Host Template #%d is not valid for this host type", h.NginxTemplateID)
	}

	return nil
}
