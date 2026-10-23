package api

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"npm/internal/api/handler"
	"npm/internal/config"
	"npm/internal/database"
	"npm/internal/entity/session"
	ssoconfig "npm/internal/entity/sso"
	"npm/internal/entity/user"
	"npm/internal/jwt"
	"npm/internal/secretstore"
	"npm/internal/sso"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

type browserFixtureAdapter struct{}

func (browserFixtureAdapter) Start(_ context.Context, _ ssoconfig.Connection, txn sso.Transaction) (sso.StartResult, error) {
	return sso.StartResult{RedirectURL: "https://idp.example/auth?state=" + txn.State}, nil
}
func (browserFixtureAdapter) Complete(_ context.Context, connection ssoconfig.Connection, _ sso.Transaction, _ *http.Request) (sso.Identity, error) {
	identity := sso.Identity{Email: "member@example.com", Name: "Member"}
	if connection.Protocol == ssoconfig.SAML {
		identity.ReplayIDs = []sso.ReplayID{{ID: "assertion", ExpiresAt: time.Now().Add(time.Minute)}}
	}
	return identity, nil
}

func TestBrowserSSOFlowThroughRouter(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "sso-flow.db")), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&session.Model{}, &user.Model{}, &user.HasCapabilityModel{}, &ssoconfig.Connection{}, &ssoconfig.AllowlistEntry{}, &ssoconfig.Policy{}, &jwt.KeysModel{}))
	for _, sql := range []string{
		"CREATE UNIQUE INDEX active_email ON user(normalized_email)",
		"CREATE TABLE auth_policy_fence (id INTEGER PRIMARY KEY, revision BIGINT NOT NULL)",
		"INSERT INTO auth_policy_fence VALUES(1,1)",
		"CREATE TABLE sso_transaction (id VARCHAR(43) PRIMARY KEY,connection_id VARCHAR(43),browser_hash VARCHAR(64),state_hash VARCHAR(64) UNIQUE,secret_ciphertext BLOB,connection_revision BIGINT,return_path TEXT,expires_at DATETIME,consumed_at DATETIME)",
		"CREATE TABLE sso_handoff (code_hash VARCHAR(64) PRIMARY KEY,browser_hash VARCHAR(64),connection_id VARCHAR(43),connection_revision BIGINT,user_id BIGINT,login_email VARCHAR(254),expires_at DATETIME,consumed_at DATETIME)",
		"CREATE TABLE sso_replay (id VARCHAR(64) PRIMARY KEY,connection_id VARCHAR(43),expires_at DATETIME)",
	} {
		require.NoError(t, db.Exec(sql).Error)
	}
	database.SetDB(db)
	old := config.IsSetup
	config.IsSetup = true
	t.Cleanup(func() { config.IsSetup = old; database.SetDB(nil); handler.RegisterBrowserSSO(nil, nil) })
	require.NoError(t, jwt.LoadKeys())
	key, err := secretstore.Open(t.TempDir())
	require.NoError(t, err)
	id := base64.RawURLEncoding.EncodeToString(bytes.Repeat([]byte{'a'}, 32))
	cfg := `{"authorization_url":"https://idp.example/auth","token_url":"https://idp.example/token","userinfo_url":"https://idp.example/user","client_id":"client","email_claim":"email","token_auth_method":"client_secret_basic"}`
	require.NoError(t, db.Create(&ssoconfig.Policy{ID: 1, Mode: ssoconfig.Parallel, PublicURL: "https://npm.example", Revision: 1}).Error)
	require.NoError(t, db.Create(&ssoconfig.Connection{ID: id, Protocol: ssoconfig.OAuth2, Name: "Provider", Enabled: true, Revision: 1, ConfigJSON: cfg, SecretCiphertext: []byte("test-only")}).Error)
	samlID := base64.RawURLEncoding.EncodeToString(bytes.Repeat([]byte{'s'}, 32))
	samlConfig := `{"idp_metadata_xml":"<EntityDescriptor/>","sp_entity_id":"urn:npm:flow","email_name_id":true}`
	require.NoError(t, db.Create(&ssoconfig.Connection{ID: samlID, Protocol: ssoconfig.SAML, Name: "SAML", Enabled: true, Revision: 1, ConfigJSON: samlConfig, SecretCiphertext: []byte("test-only")}).Error)
	require.NoError(t, db.Create(&ssoconfig.AllowlistEntry{Email: "member@example.com"}).Error)
	handler.RegisterBrowserSSO(sso.NewService(db, key, map[ssoconfig.Protocol]sso.Adapter{ssoconfig.OAuth2: browserFixtureAdapter{}, ssoconfig.SAML: browserFixtureAdapter{}}), func(_ *http.Request, _ ssoconfig.Connection, origin string) ([]byte, error) {
		require.Equal(t, "https://npm.example", origin)
		return []byte("<EntityDescriptor/>"), nil
	})
	router := NewRouter()
	request := func(method, path, body string, cookies ...*http.Cookie) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, "https://npm.example"+path, strings.NewReader(body))
		if method == http.MethodPost {
			r.Header.Set("Origin", "https://npm.example")
			if strings.HasSuffix(path, "/acs") {
				r.Header.Set("Content-Type", "application/x-www-form-urlencoded")
			}
		}
		for _, cookie := range cookies {
			r.AddCookie(cookie)
		}
		w := httptest.NewRecorder()
		router.ServeHTTP(w, r)
		return w
	}
	providers := request(http.MethodGet, "/api/auth/providers", "")
	require.Equal(t, 200, providers.Code, providers.Body.String())
	require.Contains(t, providers.Body.String(), `"password_login_available":true`)
	require.NoError(t, db.Model(&ssoconfig.Policy{}).Where("id = ?", 1).Update("mode", ssoconfig.SSOOnly).Error)
	adminRecovery := request(http.MethodGet, "/api/auth/providers", "")
	require.Equal(t, 200, adminRecovery.Code, adminRecovery.Body.String())
	require.Contains(t, adminRecovery.Body.String(), `"mode":"sso_only"`)
	require.Contains(t, adminRecovery.Body.String(), `"password_login_available":true`)
	require.NoError(t, db.Model(&ssoconfig.Policy{}).Where("id = ?", 1).Update("mode", ssoconfig.Parallel).Error)
	require.NotContains(t, providers.Body.String(), "client_id")
	require.Equal(t, 405, request(http.MethodPost, "/api/auth/providers", "").Code)
	require.Equal(t, 405, request(http.MethodGet, "/api/auth/sso/exchange", "").Code)
	require.Equal(t, 400, request(http.MethodGet, "/sso/"+id+"/start?return_path=%2F%2Fevil.example", "").Code)
	start := request(http.MethodGet, "/sso/"+id+"/start?return_path=%2Fdashboard", "")
	require.Equal(t, 302, start.Code, start.Body.String())
	require.Len(t, start.Result().Cookies(), 1)
	attempt := start.Result().Cookies()[0]
	require.True(t, strings.HasPrefix(attempt.Name, "__Host-npm-sso-attempt-"))
	providerURL, err := url.Parse(start.Header().Get("Location"))
	require.NoError(t, err)
	callbackPath := "/sso/" + id + "/callback?state=" + providerURL.Query().Get("state")
	missing := request(http.MethodGet, callbackPath, "")
	require.Equal(t, 303, missing.Code)
	require.Equal(t, "/login?sso_error=sso_login_denied", missing.Header().Get("Location"))
	callback := request(http.MethodGet, callbackPath, "", attempt)
	require.Equal(t, 303, callback.Code, callback.Body.String())
	attemptCleared := false
	for _, cookie := range callback.Result().Cookies() {
		if cookie.Name == attempt.Name {
			attemptCleared = true
			require.Equal(t, "/", cookie.Path)
			require.True(t, cookie.Secure)
			require.True(t, cookie.HttpOnly)
			require.Equal(t, http.SameSiteLaxMode, cookie.SameSite)
			require.Empty(t, cookie.Domain)
			require.Negative(t, cookie.MaxAge)
		}
	}
	require.True(t, attemptCleared)
	require.Equal(t, "no-store", callback.Header().Get("Cache-Control"))
	require.Equal(t, "no-referrer", callback.Header().Get("Referrer-Policy"))
	require.NotContains(t, callback.Header().Get("Location"), "token")
	location, err := url.Parse(callback.Header().Get("Location"))
	require.NoError(t, err)
	require.Equal(t, "/login", location.Path)
	code := location.Query().Get("sso_handoff")
	require.Len(t, code, 43)
	var handoff *http.Cookie
	for _, cookie := range callback.Result().Cookies() {
		if strings.HasPrefix(cookie.Name, "__Host-npm-sso-handoff-") {
			handoff = cookie
		}
	}
	require.NotNil(t, handoff)
	without := request(http.MethodPost, "/api/auth/sso/exchange", `{"code":"`+code+`"}`)
	require.Equal(t, 403, without.Code)
	require.Equal(t, 400, request(http.MethodPost, "/api/auth/sso/exchange", strings.Repeat("x", 4097), handoff).Code)
	oversized := request(http.MethodPost, "/api/auth/sso/exchange", strings.Repeat("x", (1<<20)+1), handoff)
	require.Equal(t, 413, oversized.Code)
	crossOrigin := httptest.NewRequest(http.MethodPost, "https://npm.example/api/auth/sso/exchange", strings.NewReader(`{"code":"`+code+`"}`))
	crossOrigin.Header.Set("Origin", "https://attacker.example")
	crossOrigin.AddCookie(handoff)
	crossResult := httptest.NewRecorder()
	router.ServeHTTP(crossResult, crossOrigin)
	require.Equal(t, 403, crossResult.Code)
	exchange := request(http.MethodPost, "/api/auth/sso/exchange", `{"code":"`+code+`"}`, handoff)
	require.Equal(t, 200, exchange.Code, exchange.Body.String())
	require.Len(t, exchange.Result().Cookies(), 1)
	deletedHandoff := exchange.Result().Cookies()[0]
	require.Equal(t, handoff.Name, deletedHandoff.Name)
	require.Equal(t, "/", deletedHandoff.Path)
	require.True(t, deletedHandoff.Secure)
	require.True(t, deletedHandoff.HttpOnly)
	require.Equal(t, http.SameSiteLaxMode, deletedHandoff.SameSite)
	require.Empty(t, deletedHandoff.Domain)
	require.Negative(t, deletedHandoff.MaxAge)
	var envelope struct {
		Result jwt.GeneratedResponse `json:"result"`
	}
	require.NoError(t, json.Unmarshal(exchange.Body.Bytes(), &envelope))
	require.NotEmpty(t, envelope.Result.Token)
	require.NotContains(t, callback.Header().Get("Location"), envelope.Result.Token)
	logoutReq := httptest.NewRequest(http.MethodPost, "https://npm.example/api/auth/logout", nil)
	logoutReq.Header.Set("Origin", "https://npm.example")
	logoutReq.Header.Set("Authorization", "Bearer "+envelope.Result.Token)
	logout := httptest.NewRecorder()
	router.ServeHTTP(logout, logoutReq)
	require.Equal(t, 200, logout.Code, logout.Body.String())
	samlStart := request(http.MethodGet, "/sso/"+samlID+"/start", "")
	require.Equal(t, 302, samlStart.Code, samlStart.Body.String())
	samlProvider, err := url.Parse(samlStart.Header().Get("Location"))
	require.NoError(t, err)
	acsRequest := httptest.NewRequest(http.MethodPost, "https://npm.example/sso/"+samlID+"/acs", strings.NewReader("RelayState="+samlProvider.Query().Get("state")+"&SAMLResponse=fixture"))
	acsRequest.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	acsRequest.Header.Set("Origin", "https://idp.example")
	acsRequest.AddCookie(samlStart.Result().Cookies()[0])
	acs := httptest.NewRecorder()
	router.ServeHTTP(acs, acsRequest)
	require.Equal(t, 303, acs.Code, acs.Body.String())
	samlAttemptCleared := false
	for _, cookie := range acs.Result().Cookies() {
		if cookie.Name == samlStart.Result().Cookies()[0].Name {
			samlAttemptCleared = true
			require.Equal(t, "/", cookie.Path)
			require.True(t, cookie.Secure)
			require.True(t, cookie.HttpOnly)
			require.Equal(t, http.SameSiteNoneMode, cookie.SameSite)
			require.Negative(t, cookie.MaxAge)
		}
	}
	require.True(t, samlAttemptCleared)
	require.Contains(t, acs.Header().Get("Location"), "sso_handoff=")
	require.Equal(t, 413, request(http.MethodPost, "/sso/"+samlID+"/acs", strings.Repeat("x", (1<<20)+1), samlStart.Result().Cookies()[0]).Code)
	require.NoError(t, db.Model(&ssoconfig.Connection{}).Where("id = ?", samlID).Update("enabled", false).Error)
	metadata := request(http.MethodGet, "/sso/"+samlID+"/metadata", "")
	require.Equal(t, 200, metadata.Code, metadata.Body.String())
	require.Equal(t, "<EntityDescriptor/>", metadata.Body.String())
}
