package setting

import (
	"encoding/json"
)

// OAuthSettings are the settings for OAuth that come from
// the `oauth-auth` setting value
type OAuthSettings struct {
	AutoCreateUser bool     `json:"auto_create_user"`
	ClientID       string   `json:"client_id"`
	ClientSecret   string   `json:"client_secret"`
	AuthURL        string   `json:"authorization_url"`
	TokenURL       string   `json:"token_url"`
	Identifier     string   `json:"identifier"`
	LogoutURL      string   `json:"logout_url"`
	Scopes         []string `json:"scopes"`
	ResourceURL    string   `json:"resource_url"`
}

// GetOAuthSettings will return the OAuth settings
func GetOAuthSettings() (OAuthSettings, error) {
	var o OAuthSettings
	var m Model
	if err := m.LoadByName("oauth-auth"); err != nil {
		return o, err
	}

	if err := json.Unmarshal([]byte(m.Value.String()), &o); err != nil {
		return o, err
	}

	o.ApplyDefaults()
	return o, nil
}

// ApplyDefaults will ensure there are defaults set
func (m *OAuthSettings) ApplyDefaults() {
	if m.Identifier == "" {
		m.Identifier = "email"
	}
}
