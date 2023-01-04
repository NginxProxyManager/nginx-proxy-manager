package validator

import (
	"fmt"

	"npm/internal/entity/certificate"
	"npm/internal/entity/host"
	"npm/internal/entity/nginxtemplate"
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
