package handler

import (
	"encoding/json"
	"testing"

	"npm/internal/entity/setting"
	"npm/internal/entity/sso"

	"github.com/stretchr/testify/require"
)

func TestLegacyImportCreatesDisabledDraftAndErasesSecret(t *testing.T) {
	db := ssoAdminDB(t)
	require.NoError(t, db.AutoMigrate(&setting.Model{}))
	legacy := setting.Model{Name: "oauth-auth", Value: []byte(`{"client_id":"client","client_secret":"sensitive","authorization_url":"https://id.example/auth","token_url":"https://id.example/token","resource_url":"https://id.example/userinfo","identifier":"email","auto_create_user":true}`)}
	require.NoError(t, db.Create(&legacy).Error)
	rec := adminRequest("POST", "/api/sso/legacy-import", `{}`, ImportLegacySSO())
	require.Equal(t, 200, rec.Code, rec.Body.String())
	var row sso.Connection
	require.NoError(t, db.First(&row).Error)
	require.False(t, row.Enabled)
	require.Equal(t, sso.OAuth2, row.Protocol)
	require.NotContains(t, row.ConfigJSON, "sensitive")
	require.NotEmpty(t, row.SecretCiphertext)
	require.NoError(t, db.First(&legacy, legacy.ID).Error)
	var value map[string]any
	require.NoError(t, json.Unmarshal(legacy.Value, &value))
	require.Empty(t, value["client_secret"])
}
