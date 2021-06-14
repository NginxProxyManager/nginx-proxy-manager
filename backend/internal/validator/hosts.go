package validator

import (
	"fmt"

	"npm/internal/entity/certificate"
	"npm/internal/entity/host"
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

	return nil
}
