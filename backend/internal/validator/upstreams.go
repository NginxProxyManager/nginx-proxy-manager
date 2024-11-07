package validator

import (
	"npm/internal/entity/upstream"

	"github.com/rotisserie/eris"
)

// ValidateUpstream will check if associated objects exist and other checks
// will return  a nil error if things are OK
func ValidateUpstream(u upstream.Model) error {
	// Needs to have more than 1 server
	if len(u.Servers) < 2 {
		return eris.New("Upstreams require at least 2 servers")
	}

	// Backup servers aren't permitted with hash balancing
	if u.IPHash {
		// check all servers for a backup param
		for _, server := range u.Servers {
			if server.Backup {
				return eris.New("Backup servers cannot be used with hash balancing")
			}
		}
	}

	// Check the nginx template exists and has the same type.
	nginxTemplate, err := nginxtemplateGetByID(u.NginxTemplateID)
	if err != nil {
		return eris.Errorf("Nginx Template #%d does not exist", u.NginxTemplateID)
	}
	if nginxTemplate.Type != "upstream" {
		return eris.Errorf("Host Template #%d is not valid for this upstream", u.NginxTemplateID)
	}

	return nil
}
