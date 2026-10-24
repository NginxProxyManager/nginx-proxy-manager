package handler

import (
	"testing"

	"npm/internal/entity/setting"

	"github.com/stretchr/testify/require"
)

func TestRetiredOAuthIsNotAdvertisedOrIssuedByTokenEndpoint(t *testing.T) {
	db := ssoAdminDB(t)
	require.NoError(t, db.AutoMigrate(&setting.Model{}))
	require.NoError(t, db.Create(&setting.Model{Name: "auth-methods", Value: []byte(`["local","oauth"]`)}).Error)
	config := adminRequest("GET", "/api/auth", "", GetAuthConfig())
	require.Equal(t, 200, config.Code)
	require.Contains(t, config.Body.String(), "local")
	require.NotContains(t, config.Body.String(), "oauth")
	token := adminRequest("POST", "/api/auth", `{"type":"oauth","identity":"a","secret":"b"}`, NewToken())
	require.Equal(t, 400, token.Code, token.Body.String())
}
