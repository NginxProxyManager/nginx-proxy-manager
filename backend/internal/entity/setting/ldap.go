package setting

import (
	"encoding/json"
)

// LDAPSettings are the settings for LDAP that come from
// the `ldap-auth` setting value
type LDAPSettings struct {
	Host           string `json:"host"`
	BaseDN         string `json:"base_dn"`
	UserDN         string `json:"user_dn"`
	EmailProperty  string `json:"email_property"`
	NameProperty   string `json:"name_property"`
	SelfFilter     string `json:"self_filter"`
	AutoCreateUser bool   `json:"auto_create_user"`
}

// GetLDAPSettings will return the LDAP settings
func GetLDAPSettings() (LDAPSettings, error) {
	var l LDAPSettings
	var m Model
	if err := m.LoadByName("ldap-auth"); err != nil {
		return l, err
	}

	if err := json.Unmarshal([]byte(m.Value.String()), &l); err != nil {
		return l, err
	}

	return l, nil
}
