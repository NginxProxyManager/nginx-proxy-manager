package setting

import (
	"encoding/json"
)

// GetAuthMethods returns the authentication methods enabled for this site
func GetAuthMethods() ([]string, error) {
	var l []string
	var m Model
	if err := m.LoadByName("auth-methods"); err != nil {
		return l, err
	}

	if err := json.Unmarshal([]byte(m.Value.String()), &l); err != nil {
		return l, err
	}

	return l, nil
}
