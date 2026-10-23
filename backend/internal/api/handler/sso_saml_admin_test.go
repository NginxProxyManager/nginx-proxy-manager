package handler

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"npm/internal/config"
	protocols "npm/internal/sso"
	"os"
	"path/filepath"
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

func TestSAMLAdminCanRevokeExpiredTrustWithoutInstallationKey(t *testing.T) {
	for _, keyState := range []string{"available", "missing", "corrupt"} {
		t.Run(keyState, func(t *testing.T) {
			db := ssoAdminDB(t)
			require.NoError(t, db.AutoMigrate(&session.Model{}))
			require.NoError(t, db.Model(&sso.Policy{}).Where("id = 1").Update("public_url", "https://npm.test").Error)
			key, err := secretKey()
			require.NoError(t, err)
			id, _ := newSSOID()
			cfg := json.RawMessage(`{"idp_metadata_url":"https://idp.test/metadata","sp_entity_id":"urn:npm:test","email_attribute":"mail"}`)
			// Stored trust can legitimately expire after import. Sealing reproduces that
			// state without test sleeps or mutating process-wide SAML clocks.
			certServer := httptest.NewTLSServer(http.NotFoundHandler())
			t.Cleanup(certServer.Close)
			metadata := `<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://idp.test"><IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol"><KeyDescriptor use="signing"><ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:X509Data><ds:X509Certificate>` + base64.StdEncoding.EncodeToString(certServer.Certificate().Raw) + `</ds:X509Certificate></ds:X509Data></ds:KeyInfo></KeyDescriptor><SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://idp.test/login"/></IDPSSODescriptor></EntityDescriptor>`
			adapter := protocols.NewSAMLAdapter(nil, key).(*protocols.SAMLAdapter)
			freshConfig, _ := json.Marshal(sso.SAMLConfig{IDPMetadataXML: metadata, SPEntityID: "urn:npm:test", EmailAttribute: "mail"})
			_, err = adapter.PreviewMetadata(context.Background(), string(freshConfig))
			require.NoError(t, err)
			expired := strings.Replace(metadata, `entityID=`, `validUntil="2000-01-01T00:00:00Z" entityID=`, 1)
			bundle, _ := json.Marshal(map[string]string{"saml_metadata": expired})
			cipher, err := key.Seal(bundle, "connection:"+id)
			require.NoError(t, err)
			conn := sso.Connection{ID: id, Protocol: sso.SAML, Name: "Original", Enabled: true, Revision: 1, ConfigJSON: string(cfg), SecretCiphertext: cipher}
			require.NoError(t, db.Create(&conn).Error)
			if keyState == "missing" {
				require.NoError(t, os.Remove(filepath.Join(config.Configuration.DataFolder, "keys", "sso.key")))
				adapter = protocols.NewSAMLAdapter(nil, nil).(*protocols.SAMLAdapter)
			}
			if keyState == "corrupt" {
				require.NoError(t, os.WriteFile(filepath.Join(config.Configuration.DataFolder, "keys", "sso.key"), []byte("corrupt"), 0600))
				adapter = protocols.NewSAMLAdapter(nil, nil).(*protocols.SAMLAdapter)
			}
			RegisterSSOSAML(adapter.PreviewMetadata, adapter.PrepareConnection)
			t.Cleanup(func() { RegisterSSOSAML(nil, nil) })
			sessionID := strings.Repeat("S", 43)
			require.NoError(t, db.Create(&session.Model{ID: sessionID, UserID: 1, Source: session.SSO, ConnectionID: id, CreatedAt: time.Now(), ExpiresAt: time.Now().Add(time.Hour)}).Error)
			require.NoError(t, db.Exec("INSERT INTO sso_transaction(id,connection_id,connection_revision) VALUES(?,?,1)", "attempt", id).Error)
			require.NoError(t, db.Exec("INSERT INTO sso_handoff(code_hash,connection_id,connection_revision) VALUES(?,?,1)", "handoff", id).Error)
			body := map[string]any{"revision": 1, "protocol": "saml", "name": "Renamed", "enabled": true, "config": cfg, "secret_action": "keep"}
			raw, _ := json.Marshal(body)
			rec := adminRequestID("PUT", "/api/sso/connections/"+id, id, string(raw), UpdateSSOConnection())
			require.Equal(t, 200, rec.Code, rec.Body.String())
			require.NoError(t, db.First(&conn, "id = ?", id).Error)
			require.Equal(t, cipher, conn.SecretCiphertext)
			body["revision"] = 2
			body["enabled"] = false
			raw, _ = json.Marshal(body)
			rec = adminRequestID("PUT", "/api/sso/connections/"+id, id, string(raw), UpdateSSOConnection())
			require.Equal(t, 200, rec.Code, rec.Body.String())
			require.NoError(t, db.First(&conn, "id = ?", id).Error)
			require.False(t, conn.Enabled)
			require.Equal(t, cipher, conn.SecretCiphertext)
			var live session.Model
			require.NoError(t, db.First(&live, "id = ?", sessionID).Error)
			require.NotNil(t, live.RevokedAt)
			for _, table := range []string{"sso_transaction", "sso_handoff"} {
				var count int64
				require.NoError(t, db.Table(table).Count(&count).Error)
				require.Zero(t, count)
			}
			body["revision"] = 3
			body["enabled"] = true
			raw, _ = json.Marshal(body)
			rec = adminRequestID("PUT", "/api/sso/connections/"+id, id, string(raw), UpdateSSOConnection())
			require.NotEqual(t, 200, rec.Code)
			require.NoError(t, db.First(&conn, "id = ?", id).Error)
			require.False(t, conn.Enabled)
			require.EqualValues(t, 3, conn.Revision)
		})
	}
}
