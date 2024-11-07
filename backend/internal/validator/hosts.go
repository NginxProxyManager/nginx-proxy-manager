package validator

import (
	"npm/internal/entity/certificate"
	"npm/internal/entity/host"
	"npm/internal/entity/nginxtemplate"
	"npm/internal/entity/upstream"

	"github.com/rotisserie/eris"
)

var (
	certificateGetByID   = certificate.GetByID
	upstreamGetByID      = upstream.GetByID
	nginxtemplateGetByID = nginxtemplate.GetByID
)

// ValidateHost will check if associated objects exist and other checks
// will return  a nil error if things are OK
func ValidateHost(h host.Model) error {
	if h.CertificateID.Uint > 0 {
		// Check certificate exists and is valid
		// This will not determine if the certificate is Ready to use,
		// as this validation only cares that the row exists.
		if _, cErr := certificateGetByID(h.CertificateID.Uint); cErr != nil {
			return eris.Wrapf(cErr, "Certificate #%d does not exist", h.CertificateID.Uint)
		}
	}

	if h.UpstreamID.Uint > 0 {
		// Check upstream exists
		if _, uErr := upstreamGetByID(h.UpstreamID.Uint); uErr != nil {
			return eris.Wrapf(uErr, "Upstream #%d does not exist", h.UpstreamID.Uint)
		}
	}

	// Ensure either UpstreamID is set or appropriate proxy host params are set
	if h.UpstreamID.Uint > 0 && (h.ProxyHost != "" || h.ProxyPort > 0) {
		return eris.Errorf("Proxy Host or Port cannot be set when using an Upstream")
	}
	if h.UpstreamID.Uint == 0 && (h.ProxyHost == "" || h.ProxyPort < 1) {
		return eris.Errorf("Proxy Host and Port must be specified, unless using an Upstream")
	}

	// Check the nginx template exists and has the same type.
	nginxTemplate, tErr := nginxtemplateGetByID(h.NginxTemplateID)
	if tErr != nil {
		return eris.Wrapf(tErr, "Host Template #%d does not exist", h.NginxTemplateID)
	}
	if nginxTemplate.Type != h.Type {
		return eris.Errorf("Host Template #%d is not valid for this host type", h.NginxTemplateID)
	}

	return nil
}
