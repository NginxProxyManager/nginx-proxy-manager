package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"npm/internal/entity/session"
	"npm/internal/entity/sso"
)

func TestSAMLAdministrationRequiresReviewedImportAndRevokesRefresh(t *testing.T) {
	db := ssoAdminDB(t)
	require.NoError(t, db.AutoMigrate(&session.Model{}))
	cfg := json.RawMessage(`{"idp_metadata_url":"https://idp.test/metadata","sp_entity_id":"urn:npm:test","email_attribute":"mail"}`)
	RegisterSSOSAML(nil, nil)
	t.Cleanup(func() { RegisterSSOSAML(nil, nil) })
	body := map[string]any{"protocol": "saml", "name": "Corporate", "enabled": false, "config": cfg, "secret_action": "clear"}
	raw, _ := json.Marshal(body)
	rec := adminRequest("POST", "/api/sso/connections", string(raw), CreateSSOConnection())
	require.Equal(t, http.StatusBadRequest, rec.Code)
	RegisterSSOSAML(func(ctx context.Context, raw string) (sso.SAMLMetadataPreview, error) {
		return sso.SAMLMetadataPreview{ImportToken: "reviewed", EntityID: "https://idp.test"}, nil
	}, func(ctx context.Context, old *sso.Connection, next sso.Connection, token string) ([]byte, error) {
		if token != "" && token != "reviewed" {
			return nil, errSSOInvalid
		}
		if token == "" {
			if old == nil {
				return nil, errSSOInvalid
			}
			return old.SecretCiphertext, nil
		}
		key, err := secretKey()
		if err != nil {
			return nil, err
		}
		return key.Seal([]byte(`{"saml_metadata":"frozen-public-trust"}`), "connection:"+next.ID)
	})
	body["saml_import_token"] = "reviewed"
	raw, _ = json.Marshal(body)
	rec = adminRequest("POST", "/api/sso/connections", string(raw), CreateSSOConnection())
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.NotContains(t, rec.Body.String(), "frozen-public-trust")
	var conn sso.Connection
	require.NoError(t, db.First(&conn).Error)
	original := append([]byte(nil), conn.SecretCiphertext...)
	sessionID := strings.Repeat("S", 43)
	require.NoError(t, db.Create(&session.Model{ID: sessionID, UserID: 1, Source: session.SSO, ConnectionID: conn.ID, CreatedAt: time.Now(), ExpiresAt: time.Now().Add(time.Hour)}).Error)
	require.NoError(t, db.Exec("INSERT INTO sso_transaction(id,connection_id,connection_revision) VALUES(?,?,1)", "attempt", conn.ID).Error)
	delete(body, "saml_import_token")
	body["revision"] = 1
	body["name"] = "Renamed"
	body["secret_action"] = "keep"
	raw, _ = json.Marshal(body)
	rec = adminRequestID("PUT", "/api/sso/connections/"+conn.ID, conn.ID, string(raw), UpdateSSOConnection())
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.NoError(t, db.First(&conn).Error)
	require.Equal(t, original, conn.SecretCiphertext)
	var live session.Model
	require.NoError(t, db.First(&live, "id = ?", sessionID).Error)
	require.Nil(t, live.RevokedAt)
	body["revision"] = 2
	body["saml_import_token"] = "reviewed"
	raw, _ = json.Marshal(body)
	rec = adminRequestID("PUT", "/api/sso/connections/"+conn.ID, conn.ID, string(raw), UpdateSSOConnection())
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.NoError(t, db.First(&live, "id = ?", sessionID).Error)
	require.NotNil(t, live.RevokedAt)
	var count int64
	require.NoError(t, db.Table("sso_transaction").Count(&count).Error)
	require.Zero(t, count)
	rec = adminRequest("POST", "/api/sso/saml/metadata-preview", `{"config":`+string(cfg)+`}`, PreviewSSOSAMLMetadata())
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), "reviewed")
	require.NoError(t, db.Model(&sso.Connection{}).Count(&count).Error)
	require.EqualValues(t, 1, count)
	rec = adminRequest("POST", "/api/sso/saml/metadata-preview", `{"config":`+string(cfg)+`,"private_key":"bad"}`, PreviewSSOSAMLMetadata())
	require.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestSAMLProtocolChangeReplacesOAuthSecretOnlyWithReviewedImport(t *testing.T) {
	db := ssoAdminDB(t)
	require.NoError(t, db.AutoMigrate(&session.Model{}))
	RegisterSSOSAML(nil, func(ctx context.Context, old *sso.Connection, next sso.Connection, token string) ([]byte, error) {
		if token != "reviewed" {
			return nil, errSSOInvalid
		}
		return []byte("prepared-saml-bundle"), nil
	})
	t.Cleanup(func() { RegisterSSOSAML(nil, nil) })
	rec := adminRequest("POST", "/api/sso/connections", `{"protocol":"oidc","name":"Change","enabled":false,"config":{"issuer_url":"https://idp.test","client_id":"npm","email_claim":"email"},"secret_action":"replace","secret_value":"old-oauth-secret"}`, CreateSSOConnection())
	require.Equal(t, 200, rec.Code)
	var conn sso.Connection
	require.NoError(t, db.First(&conn).Error)
	body := `{"revision":1,"protocol":"saml","name":"Change","enabled":false,"config":{"idp_metadata_url":"https://idp.test/metadata","sp_entity_id":"urn:npm:test","email_attribute":"mail"},"secret_action":"keep","saml_import_token":"reviewed"}`
	rec = adminRequestID("PUT", "/api/sso/connections/"+conn.ID, conn.ID, body, UpdateSSOConnection())
	require.Equal(t, 200, rec.Code, rec.Body.String())
	require.NoError(t, db.First(&conn).Error)
	require.Equal(t, []byte("prepared-saml-bundle"), conn.SecretCiphertext)
}
