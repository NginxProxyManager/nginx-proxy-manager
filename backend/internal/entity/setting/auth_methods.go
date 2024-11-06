package setting

import (
	"encoding/json"
	"slices"
)

// GetAuthMethods returns the authentication methods enabled for this site
func GetAuthMethods() ([]string, error) {
	var m Model
	if err := m.LoadByName("auth-methods"); err != nil {
		return nil, err
	}

	var r []string
	if err := json.Unmarshal([]byte(m.Value.String()), &r); err != nil {
		return nil, err
	}

	return r, nil
}

// AuthMethodEnabled checks that the auth method given is
// enabled in the db setting
func AuthMethodEnabled(method string) bool {
	r, err := GetAuthMethods()
	if err != nil {
		return false
	}

	return slices.Contains(r, method)
}
