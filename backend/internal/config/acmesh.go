package config

import (
	"fmt"
)

type acmesh struct {
	Home       string `json:"home" envconfig:"optional,default=/data/.acme.sh"`
	ConfigHome string `json:"config_home" envconfig:"optional,default=/data/.acme.sh/config"`
	CertHome   string `json:"cert_home" envconfig:"optional,default=/data/.acme.sh/certs"`
}

// GetWellknown returns the well known path
func (a *acmesh) GetWellknown() string {
	return fmt.Sprintf("%s/.well-known", a.Home)
}
