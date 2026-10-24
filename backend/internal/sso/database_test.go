package sso

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// An opt-in engine runs the SAME service suite. MySQL must be the dedicated
// disposable fixture; PostgreSQL gets a new private schema for every test.
func serviceTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	engine := os.Getenv("SSO_SERVICE_TEST_ENGINE")
	dsn := os.Getenv("SSO_SERVICE_TEST_DSN")
	cfg := &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)}
	var db *gorm.DB
	var err error
	switch engine {
	case "", "sqlite":
		db, err = gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "sso.db")), cfg)
	case "postgres":
		require.NotEmpty(t, dsn)
		admin, openErr := gorm.Open(postgres.Open(dsn), cfg)
		require.NoError(t, openErr)
		schema := fmt.Sprintf("npm_sso_task6_%d", time.Now().UnixNano())
		require.NoError(t, admin.Exec("CREATE SCHEMA "+schema).Error)
		t.Cleanup(func() {
			require.NoError(t, admin.Exec("DROP SCHEMA "+schema+" CASCADE").Error)
			pool, _ := admin.DB()
			_ = pool.Close()
		})
		db, err = gorm.Open(postgres.Open(dsn+" search_path="+schema), cfg)
	case "mysql":
		require.NotEmpty(t, dsn)
		db, err = gorm.Open(mysql.Open(dsn), cfg)
		require.NoError(t, err)
		var name string
		require.NoError(t, db.Raw("SELECT DATABASE()").Scan(&name).Error)
		require.Equal(t, "npm_sso_task6_tests", name, "tests refuse other MySQL databases")
	default:
		t.Fatalf("unknown service test engine %q", engine)
	}
	require.NoError(t, err)
	pool, err := db.DB()
	require.NoError(t, err)
	pool.SetMaxOpenConns(8)
	t.Cleanup(func() {
		if engine == "mysql" {
			require.NoError(t, db.Migrator().DropTable("sso_handoff", "sso_transaction", "sso_replay", "session", "sso_allowlist", "sso_connection", "user_has_capability", "user", "auth_policy_fence"))
		}
		_ = pool.Close()
	})
	return db
}
