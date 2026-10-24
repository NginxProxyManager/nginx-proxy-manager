package handler

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	h "npm/internal/api/http"
	"npm/internal/database"
	"npm/internal/entity/setting"
	"npm/internal/entity/sso"

	"gorm.io/gorm"
)

// LegacySSOStatus exposes only conversion readiness, never the old credential.
func LegacySSOStatus() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var legacy setting.Model
		err := database.GetDB().WithContext(r.Context()).Where("name = ?", "oauth-auth").First(&legacy).Error
		if err != nil && err != gorm.ErrRecordNotFound {
			ssoError(w, r, err)
			return
		}
		available := false
		if err == nil {
			var raw setting.OAuthSettings
			available = json.Unmarshal(legacy.Value, &raw) == nil && raw.ClientSecret != ""
		}
		h.ResultResponseJSON(w, r, http.StatusOK, map[string]bool{"conversion_available": available})
	}
}

func ImportLegacySSO() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		key, err := secretKey()
		if err != nil {
			ssoError(w, r, err)
			return
		}
		id, err := newSSOID()
		if err != nil {
			ssoError(w, r, errSSOInvalid)
			return
		}
		var output sso.Connection
		err = sso.WithPolicyWrite(r.Context(), func(tx *gorm.DB) error {
			var legacy setting.Model
			if err := tx.Where("name = ?", "oauth-auth").First(&legacy).Error; err != nil {
				return errSSOInvalid
			}
			var raw setting.OAuthSettings
			if json.Unmarshal(legacy.Value, &raw) != nil || raw.ClientSecret == "" {
				return errSSOInvalid
			}
			// The operator reviews the email claim, HTTPS endpoints, and disabled
			// draft before enabling. Legacy allowlist and auto-create are ignored.
			config := sso.OAuth2Config{AuthorizationURL: raw.AuthURL, TokenURL: raw.TokenURL, UserinfoURL: raw.ResourceURL, ClientID: raw.ClientID, EmailClaim: "email", TokenAuthMethod: "client_secret_basic", Scopes: raw.Scopes}
			if strings.EqualFold(raw.Identifier, "email") {
				config.EmailClaim = raw.Identifier
			}
			body, err := json.Marshal(config)
			if err != nil || sso.ValidateConfig(sso.OAuth2, string(body)) != nil {
				return errSSOInvalid
			}
			cipher, err := sealClientSecret(key, id, raw.ClientSecret)
			if err != nil {
				return errSSOKey
			}
			output = sso.Connection{ID: id, Protocol: sso.OAuth2, Name: "Imported legacy OAuth2", Enabled: false, Revision: 1, ConfigJSON: string(body), SecretCiphertext: cipher}
			if err := tx.Create(&output).Error; err != nil {
				return err
			}
			raw.ClientSecret = ""
			cleared, err := json.Marshal(raw)
			if err != nil {
				return err
			}
			if err := tx.Model(&legacy).Updates(map[string]any{"value": cleared, "updated_at": time.Now().UnixMilli()}).Error; err != nil {
				return err
			}
			return auditSSO(tx, r, "legacy_import", id, 1)
		})
		if err != nil {
			ssoError(w, r, err)
			return
		}
		h.ResultResponseJSON(w, r, http.StatusOK, connectionView(output))
	}
}
