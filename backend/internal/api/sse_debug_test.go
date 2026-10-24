package api

import (
	"net/http/httptest"
	"os"
	"testing"

	"github.com/stretchr/testify/require"
	"npm/internal/config"
	"npm/internal/entity/user"
)

func TestDeliveryControlRequiresDebugAndCurrentFullAdmin(t *testing.T) {
	previous := config.Configuration
	oldLevel := os.Getenv("NPM_LOG_LEVEL")
	version, commit := config.Version, config.Commit
	t.Cleanup(func() {
		_ = os.Setenv("NPM_LOG_LEVEL", oldLevel)
		config.Init(&version, &commit)
		config.Configuration = previous
	})
	t.Setenv("NPM_LOG_LEVEL", "info")
	config.Init(&version, &commit)
	db, router, token := userContractRouter(t)
	body := `{"test_delivery_gate":{"session_id":"invalid","action":"pause"}}`
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, authenticatedJSONRequest("POST", "/api/sse-notification", body, token))
	require.Equal(t, 404, rec.Code)
	t.Setenv("NPM_LOG_LEVEL", "debug")
	config.Init(&version, &commit)
	router = NewRouter()
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, authenticatedJSONRequest("POST", "/api/sse-notification", body, token))
	require.Equal(t, 400, rec.Code, "debug admin reaches strict gate validation")
	require.NoError(t, db.Model(&user.HasCapabilityModel{}).Where("user_id = ?", 1).Update("capability_name", user.CapabilityHostsView).Error)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, authenticatedJSONRequest("POST", "/api/sse-notification", body, token))
	require.Equal(t, 403, rec.Code, "freshly revoked admin cannot control delivery")
}
