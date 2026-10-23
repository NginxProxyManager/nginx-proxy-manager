package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	c "npm/internal/api/context"
	"npm/internal/config"
	"npm/internal/database"
	"npm/internal/entity/session"
	"npm/internal/entity/setting"
	"npm/internal/entity/sso"
	"npm/internal/secretstore"

	"github.com/glebarez/sqlite"
	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func ssoAdminDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(t.TempDir()+"/sso.db"), &gorm.Config{})
	require.NoError(t, err)
	database.SetDB(db)
	config.Configuration.DataFolder = t.TempDir()
	require.NoError(t, db.AutoMigrate(&sso.Policy{}, &sso.Connection{}, &sso.AllowlistEntry{}))
	require.NoError(t, db.Exec("CREATE TABLE auth_policy_fence (id INTEGER PRIMARY KEY, revision INTEGER NOT NULL)").Error)
	require.NoError(t, db.Exec("INSERT INTO auth_policy_fence VALUES (1, 1)").Error)
	require.NoError(t, db.Exec("CREATE TABLE sso_transaction (id TEXT PRIMARY KEY, connection_id TEXT, connection_revision INTEGER, secret_ciphertext BLOB)").Error)
	require.NoError(t, db.Exec("CREATE TABLE sso_handoff (code_hash TEXT PRIMARY KEY, connection_id TEXT, connection_revision INTEGER, login_email TEXT)").Error)
	require.NoError(t, db.Exec("CREATE TABLE audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at BIGINT, updated_at BIGINT, is_deleted BIGINT, user_id BIGINT, object_type TEXT, object_id BIGINT, action TEXT, meta TEXT)").Error)
	require.NoError(t, db.Create(&sso.Policy{ID: 1, Mode: sso.Parallel, Revision: 1}).Error)
	t.Cleanup(func() { database.SetDB(nil) })
	return db
}

func adminRequest(method, path, body string, fn http.HandlerFunc) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req = req.WithContext(context.WithValue(req.Context(), c.BodyCtxKey, []byte(body)))
	rec := httptest.NewRecorder()
	fn(rec, req)
	return rec
}

func adminRequestID(method, path, id, body string, fn http.HandlerFunc) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	route := chi.NewRouteContext()
	route.URLParams.Add("id", id)
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, route)
	ctx = context.WithValue(ctx, c.BodyCtxKey, []byte(body))
	rec := httptest.NewRecorder()
	fn(rec, req.WithContext(ctx))
	return rec
}

func TestSSOPolicyRejectsStaleRevisionAndInvalidOnlyMode(t *testing.T) {
	ssoAdminDB(t)
	rec := adminRequest("PUT", "/api/sso/policy", `{"revision":1,"mode":"sso_only","public_url":"https://npm.example"}`, UpdateSSOPolicy())
	require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
	rec = adminRequest("PUT", "/api/sso/policy", `{"revision":2,"mode":"parallel","public_url":"https://npm.example"}`, UpdateSSOPolicy())
	require.Equal(t, http.StatusConflict, rec.Code, rec.Body.String())
}

func TestSSOAllowlistNormalizesAndRejectsInvalid(t *testing.T) {
	db := ssoAdminDB(t)
	rec := adminRequest("PUT", "/api/sso/allowlist", `{"revision":1,"emails":["team.example"]}`, UpdateSSOAllowlist())
	require.Equal(t, http.StatusBadRequest, rec.Code)
	rec = adminRequest("PUT", "/api/sso/allowlist", `{"revision":1,"emails":["Alice@Example.COM"]}`, UpdateSSOAllowlist())
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var emails []sso.AllowlistEntry
	require.NoError(t, db.Find(&emails).Error)
	require.Equal(t, []sso.AllowlistEntry{{Email: "alice@example.com"}}, emails)
	var p sso.Policy
	require.NoError(t, db.First(&p, 1).Error)
	require.Equal(t, uint64(2), p.Revision)
}

func TestSSOConnectionSecretIsEncryptedAndMasked(t *testing.T) {
	db := ssoAdminDB(t)
	create := `{"protocol":"oidc","name":"Identity","enabled":false,"config":{"issuer_url":"https://id.example","client_id":"npm","email_claim":"email"},"secret_action":"replace","secret_value":"sensitive-value"}`
	rec := adminRequest("POST", "/api/sso/connections", create, CreateSSOConnection())
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.NotContains(t, rec.Body.String(), "sensitive-value")
	var conn sso.Connection
	require.NoError(t, db.First(&conn).Error)
	require.NotContains(t, conn.ConfigJSON, "sensitive-value")
	require.NotContains(t, string(conn.SecretCiphertext), "sensitive-value")
	require.NotEmpty(t, conn.SecretCiphertext)
	key, err := secretstore.Open(config.Configuration.DataFolder)
	require.NoError(t, err)
	plain, err := key.Unseal(conn.SecretCiphertext, "connection:"+conn.ID)
	require.NoError(t, err)
	require.JSONEq(t, `{"client_secret":"sensitive-value"}`, string(plain))
	var auditMeta string
	require.NoError(t, db.Table("audit_log").Select("meta").Where("action = ?", "connection_create").Scan(&auditMeta).Error)
	require.Contains(t, auditMeta, conn.ID)
	require.NotContains(t, auditMeta, "sensitive-value")
	var result map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &result))
	require.Equal(t, true, result["result"].(map[string]any)["has_secret"])
	updated := adminRequestID("PUT", "/api/sso/connections/"+conn.ID, conn.ID, `{"revision":1,"protocol":"oidc","name":"Renamed","enabled":false,"config":{"issuer_url":"https://id.example","client_id":"npm","email_claim":"email"},"secret_action":"keep"}`, UpdateSSOConnection())
	require.Equal(t, http.StatusOK, updated.Code, updated.Body.String())
	var retained sso.Connection
	require.NoError(t, db.First(&retained, "id = ?", conn.ID).Error)
	require.Equal(t, conn.SecretCiphertext, retained.SecretCiphertext)
	require.NotContains(t, updated.Body.String(), "sensitive-value")
}

func TestRemovingAllowlistEmailRevokesSSOSessionsAndPendingHandoffs(t *testing.T) {
	db := ssoAdminDB(t)
	require.NoError(t, db.AutoMigrate(&session.Model{}))
	id, _ := newSSOID()
	sessionID, _ := newSSOID()
	childID, _ := newSSOID()
	require.NoError(t, db.Create(&sso.AllowlistEntry{Email: "person@example.com"}).Error)
	require.NoError(t, db.Create(&sso.Connection{ID: id, Protocol: sso.OIDC, Name: "IdP", Enabled: true, Revision: 1, ConfigJSON: `{"issuer_url":"https://id.example","client_id":"npm","email_claim":"email"}`}).Error)
	require.NoError(t, db.Create(&session.Model{ID: sessionID, Source: session.SSO, ConnectionID: id, LoginEmail: "person@example.com", UserID: 1, ExpiresAt: time.Now().Add(time.Hour)}).Error)
	require.NoError(t, db.Create(&session.Model{ID: childID, Source: session.Impersonation, ParentID: sessionID, UserID: 2, ExpiresAt: time.Now().Add(time.Hour)}).Error)
	require.NoError(t, db.Exec("INSERT INTO sso_handoff (code_hash,connection_id,login_email) VALUES ('pending',?,?)", id, "person@example.com").Error)
	rec := adminRequest("PUT", "/api/sso/allowlist", `{"revision":1,"emails":[]}`, UpdateSSOAllowlist())
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var active int64
	require.NoError(t, db.Model(&session.Model{}).Where("revoked_at IS NULL").Count(&active).Error)
	require.Zero(t, active)
	var pending int64
	require.NoError(t, db.Table("sso_handoff").Count(&pending).Error)
	require.Zero(t, pending)
}

func TestNameOnlyEditKeepsPendingAttemptsAtNewRevision(t *testing.T) {
	db := ssoAdminDB(t)
	id, _ := newSSOID()
	configJSON := `{"issuer_url":"https://id.example","client_id":"npm","email_claim":"email"}`
	require.NoError(t, db.Create(&sso.Connection{ID: id, Protocol: sso.OIDC, Name: "Old", Revision: 1, ConfigJSON: configJSON}).Error)
	require.NoError(t, db.Exec("INSERT INTO sso_transaction (id,connection_id,connection_revision) VALUES ('attempt',?,1)", id).Error)
	require.NoError(t, db.Exec("INSERT INTO sso_handoff (code_hash,connection_id,connection_revision) VALUES ('handoff',?,1)", id).Error)
	update := `{"revision":1,"protocol":"oidc","name":"New","enabled":false,"config":` + configJSON + `,"secret_action":"keep"}`
	rec := adminRequestID("PUT", "/api/sso/connections/"+id, id, update, UpdateSSOConnection())
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	for _, table := range []string{"sso_transaction", "sso_handoff"} {
		var rev uint64
		require.NoError(t, db.Table(table).Select("connection_revision").Where("connection_id = ?", id).Scan(&rev).Error)
		require.Equal(t, uint64(2), rev, table)
	}
}

func TestGenericSettingsHideOwnedCredentialsAndRejectWrites(t *testing.T) {
	db := ssoAdminDB(t)
	require.NoError(t, db.AutoMigrate(&setting.Model{}))
	require.NoError(t, db.Create(&setting.Model{Name: "oauth-auth", Value: []byte(`{"client_secret":"legacy-secret"}`)}).Error)
	require.NoError(t, db.Create(&setting.Model{Name: "default-site", Value: []byte(`{"type":"404"}`)}).Error)
	rec := adminRequest("GET", "/api/settings", ``, GetSettings())
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.NotContains(t, rec.Body.String(), "legacy-secret")
	require.Contains(t, rec.Body.String(), `"total":1`)
	rec = adminRequest("POST", "/api/settings", `{"name":"oauth-auth","value":{"client_secret":"new-secret"}}`, CreateSetting())
	require.Equal(t, http.StatusForbidden, rec.Code)
}

func TestConnectionReadsNeverExposeLegacyConfigSecrets(t *testing.T) {
	db := ssoAdminDB(t)
	id, _ := newSSOID()
	require.NoError(t, db.Create(&sso.Connection{ID: id, Protocol: sso.OIDC, Name: "Old", Revision: 1, ConfigJSON: `{"issuer_url":"https://id.example","client_id":"npm","client_secret":"legacy-plaintext"}`}).Error)
	list := adminRequest("GET", "/api/sso/connections", "", GetSSOConnections())
	require.Equal(t, http.StatusOK, list.Code)
	require.NotContains(t, list.Body.String(), "legacy-plaintext")
	detail := adminRequestID("GET", "/api/sso/connections/"+id, id, "", GetSSOConnection())
	require.Equal(t, http.StatusOK, detail.Code)
	require.NotContains(t, detail.Body.String(), "legacy-plaintext")
}

func TestSSOOpenAPISchemasResolve(t *testing.T) {
	var document struct {
		Paths map[string]map[string]json.RawMessage `json:"paths"`
	}
	require.NoError(t, json.Unmarshal(getSchema(), &document))
	for _, path := range []string{"/sso/policy", "/sso/connections", "/sso/connections/{id}", "/sso/connections/{id}/test", "/sso/allowlist"} {
		require.NotEmpty(t, document.Paths[path], path)
	}
	require.NotContains(t, string(getSchema()), "{{schema.SSO")
}

func TestSAMLRejectsUploadedSigningPrivateKey(t *testing.T) {
	ssoAdminDB(t)
	create := `{"protocol":"saml","name":"Identity","enabled":false,"config":{"idp_metadata_xml":"<EntityDescriptor />","sp_entity_id":"urn:example:npm","email_name_id":true},"secret_action":"replace","secret_value":"private-key"}`
	rec := adminRequest("POST", "/api/sso/connections", create, CreateSSOConnection())
	require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
}

func TestMissingEncryptionKeyExplainsRestoreAction(t *testing.T) {
	db := ssoAdminDB(t)
	create := `{"protocol":"oidc","name":"Identity","enabled":false,"config":{"issuer_url":"https://id.example","client_id":"npm","email_claim":"email"},"secret_action":"replace","secret_value":"sensitive-value"}`
	rec := adminRequest("POST", "/api/sso/connections", create, CreateSSOConnection())
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var conn sso.Connection
	require.NoError(t, db.First(&conn).Error)
	require.NoError(t, os.Remove(filepath.Join(config.Configuration.DataFolder, "keys", "sso.key")))
	update := `{"revision":1,"protocol":"oidc","name":"Renamed","enabled":false,"config":{"issuer_url":"https://id.example","client_id":"npm","email_claim":"email"},"secret_action":"keep"}`
	rec = adminRequestID("PUT", "/api/sso/connections/"+conn.ID, conn.ID, update, UpdateSSOConnection())
	require.Equal(t, http.StatusServiceUnavailable, rec.Code)
	require.Contains(t, rec.Body.String(), "sso_key_restore_required")
}
