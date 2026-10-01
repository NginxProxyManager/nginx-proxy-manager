package api

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"npm/internal/config"
	"npm/internal/database"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSetupRouter(t *testing.T) {
	config.Configuration.DataFolder = t.TempDir()
	config.Configuration.DB = config.DBConfig{}
	config.IsDBSetup = false
	defer func() {
		database.Close()
		config.Configuration.DB = config.DBConfig{}
		config.IsDBSetup = false
	}()

	post := func(sr http.Handler, body string) *httptest.ResponseRecorder {
		respRec := httptest.NewRecorder()
		req, _ := http.NewRequest("POST", "/api/setup/database", strings.NewReader(body))
		sr.ServeHTTP(respRec, req)
		return respRec
	}

	failing := NewSetupRouter(func() error { return errors.New("boom") })

	// Health is available and reports the database isn't set up
	respRec := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/", nil)
	failing.ServeHTTP(respRec, req)
	assert.Equal(t, http.StatusOK, respRec.Code)
	assert.Contains(t, respRec.Body.String(), `"db_setup":false`)

	// Everything else in the api is blocked
	respRec = httptest.NewRecorder()
	req, _ = http.NewRequest("POST", "/api/users", strings.NewReader(`{}`))
	failing.ServeHTTP(respRec, req)
	assert.Equal(t, http.StatusForbidden, respRec.Code)

	// Schema validation
	assert.Equal(t, http.StatusBadRequest, post(failing, `{"driver":"oracle"}`).Code)

	// Postgres schema must be a plain identifier
	assert.Equal(t, http.StatusBadRequest, post(failing, `{"driver":"postgres","schema":"public; drop table x"}`).Code)

	// Postgres/mysql config missing fields
	assert.Equal(t, http.StatusBadRequest, post(failing, `{"driver":"postgres","host":"db"}`).Code)

	// A failure to start rolls back the saved config
	assert.Equal(t, http.StatusInternalServerError, post(failing, `{"driver":"sqlite"}`).Code)
	assert.False(t, config.Configuration.DB.IsConfigured())
	_, err := os.Stat(config.GetDBConfigFile())
	assert.True(t, os.IsNotExist(err))

	// Success saves the config and calls the callback
	called := false
	sr := NewSetupRouter(func() error {
		called = true
		config.IsDBSetup = true
		return nil
	})
	respRec = post(sr, `{"driver":"sqlite","host":"ignored"}`)
	require.Equal(t, http.StatusOK, respRec.Code, respRec.Body.String())
	assert.True(t, called)
	assert.Equal(t, config.DBConfig{Driver: config.DatabaseSqlite}, config.Configuration.DB)
	content, err := os.ReadFile(config.GetDBConfigFile())
	require.NoError(t, err)
	assert.Contains(t, string(content), `"driver": "sqlite"`)

	// Can't be configured twice
	assert.Equal(t, http.StatusForbidden, post(sr, `{"driver":"sqlite"}`).Code)
}
