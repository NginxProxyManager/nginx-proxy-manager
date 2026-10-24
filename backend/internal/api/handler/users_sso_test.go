package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	c "npm/internal/api/context"
	"npm/internal/config"
	"npm/internal/database"
	"npm/internal/entity/user"
	"npm/internal/migrations"
)

func TestCreateFirstLocalAdministratorKeepsPasswordEnabled(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "db")), &gorm.Config{})
	require.NoError(t, err)
	database.SetDB(db)
	config.Configuration.DB.Driver = config.DatabaseSqlite
	require.True(t, migrations.Migrate(func() {}))
	previousSetup := config.IsSetup
	config.IsSetup = false
	t.Cleanup(func() { config.IsSetup = previousSetup; database.SetDB(nil) })

	body := []byte(`{"name":"First Admin","email":"first@example.com","auth":{"type":"local","secret":"passphrase"}}`)
	r := httptest.NewRequest(http.MethodPost, "/users", nil)
	r = r.WithContext(context.WithValue(r.Context(), c.BodyCtxKey, body))
	w := httptest.NewRecorder()
	CreateUser()(w, r)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	var response struct {
		Result user.Model `json:"result"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &response))
	require.True(t, response.Result.AdminPasswordEnabled)
	var saved user.Model
	require.NoError(t, db.First(&saved, response.Result.ID).Error)
	require.True(t, saved.AdminPasswordEnabled)
}
