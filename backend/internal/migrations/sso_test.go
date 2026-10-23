package migrations

import (
	"context"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	polyschema "github.com/jc21/polyschema/v1"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"npm/embed"
	"npm/internal/config"
	"npm/internal/database"
	"npm/internal/entity/user"
)

func TestSSOFreshSchema(t *testing.T) {
	db := openTestDB(t)
	database.SetDB(db)
	require.True(t, Migrate(func() {}))
	for _, table := range []string{"sso_connection", "sso_policy", "sso_allowlist", "sso_transaction", "sso_replay", "sso_handoff", "session", "auth_policy_fence"} {
		require.True(t, db.Migrator().HasTable(table), table)
	}
	var mode string
	require.NoError(t, db.Table("sso_policy").Select("mode").Scan(&mode).Error)
	require.Equal(t, "parallel", mode)
	require.True(t, db.Migrator().HasColumn("user", "normalized_email"))
}

func TestSSOExternalEngineMigration(t *testing.T) {
	for _, engine := range []struct {
		name string
		env  string
		open func(string) gorm.Dialector
	}{
		{"postgres", "SSO_TEST_POSTGRES_DSN", func(dsn string) gorm.Dialector { return postgres.Open(dsn) }},
		{"mysql", "SSO_TEST_MYSQL_DSN", func(dsn string) gorm.Dialector { return mysql.Open(dsn) }},
	} {
		t.Run(engine.name, func(t *testing.T) {
			dsn := os.Getenv(engine.env)
			if dsn == "" {
				t.Skip(engine.env + " not set")
			}
			db, err := gorm.Open(engine.open(dsn), &gorm.Config{})
			require.NoError(t, err)
			config.Configuration.DB.Driver = engine.name
			database.SetDB(db)
			require.True(t, Migrate(func() {}))
			require.True(t, db.Migrator().HasTable("sso_connection"))
			require.True(t, db.Migrator().HasTable("session"))
			require.True(t, Migrate(func() {}))
			email := fmt.Sprintf("race-%d@example.com", time.Now().UnixNano())
			tx := db.Begin()
			require.NoError(t, tx.Error)
			var count int64
			require.NoError(t, tx.Table("user").Where("normalized_email = ?", email).Count(&count).Error)
			require.Zero(t, count)
			require.NoError(t, db.Table("user").Create(map[string]any{"name": "Race Winner", "email": email, "normalized_email": email, "is_deleted": 0, "is_system": false, "is_disabled": false, "admin_password_enabled": false, "credential_origin": "local"}).Error)
			resolved, created, err := user.GetOrCreateSSO(tx, strings.ToUpper(email), "Loser")
			require.NoError(t, err)
			require.False(t, created)
			require.Equal(t, "Race Winner", resolved.Name)
			require.NoError(t, tx.Commit().Error)
		})
	}
}

func baselineDatabase(t *testing.T) {
	t.Helper()
	files, err := fs.Sub(embed.MigrationFiles, "migrations")
	require.NoError(t, err)
	dir := t.TempDir()
	for _, name := range []string{"20260925000000_initial_schema.yml", "20260925000001_initial_data.yml"} {
		contents, err := fs.ReadFile(files, name)
		require.NoError(t, err)
		require.NoError(t, os.WriteFile(filepath.Join(dir, name), contents, 0600))
	}
	db := database.GetDB()
	sqlDB, err := db.DB()
	require.NoError(t, err)
	require.NoError(t, polyschema.New(sqlDB, polyschema.SQLite, polyschema.WithTable(historyTable)).Up(context.Background(), os.DirFS(dir)))
}

func TestSSOUpgradeRejectsDuplicateNormalizedEmailsBeforeSchemaChange(t *testing.T) {
	db := openTestDB(t)
	database.SetDB(db)
	baselineDatabase(t)
	for _, email := range []string{" User@Example.com ", "user@example.COM"} {
		require.NoError(t, db.Exec(`INSERT INTO "user" (name,email,is_deleted,is_system,is_disabled) VALUES (?,?,0,0,0)`, "Existing", email).Error)
	}
	var ids []uint
	require.NoError(t, db.Table("user").Where("is_system = 0").Order("id").Pluck("id", &ids).Error)
	require.Len(t, ids, 2)
	err := preflightSSO(db)
	require.ErrorContains(t, err, "conflicting user IDs")
	for _, id := range ids {
		require.Contains(t, err.Error(), fmt.Sprint(id))
	}
	require.False(t, Migrate(func() { t.Error("followup called") }))
	require.False(t, db.Migrator().HasColumn("user", "normalized_email"))
}

func TestSSOUpgradePreservesUsersAndSeedsAdminPasswordPolicy(t *testing.T) {
	db := openTestDB(t)
	database.SetDB(db)
	baselineDatabase(t)
	require.NoError(t, db.Exec(`INSERT INTO "user" (id,name,email,is_deleted,is_system,is_disabled) VALUES (42,'Admin','Admin@Example.com',0,0,0),(43,'Pending','pending@example.com',0,0,0)`).Error)
	require.NoError(t, db.Exec(`INSERT INTO user_has_capability (user_id,capability_name) VALUES (42,'full-admin')`).Error)
	require.True(t, Migrate(func() {}))
	var rows []struct {
		ID                   uint
		NormalizedEmail      *string
		AdminPasswordEnabled bool
		CredentialOrigin     string
	}
	require.NoError(t, db.Table("user").Where("id IN ?", []uint{42, 43}).Order("id").Find(&rows).Error)
	require.Len(t, rows, 2)
	require.Equal(t, "admin@example.com", *rows[0].NormalizedEmail)
	require.True(t, rows[0].AdminPasswordEnabled)
	require.False(t, rows[1].AdminPasswordEnabled)
	require.Equal(t, "local", rows[0].CredentialOrigin)
	require.Error(t, db.Exec(`INSERT INTO "user" (name,email,normalized_email,is_deleted,is_system,is_disabled,admin_password_enabled,credential_origin) VALUES ('Duplicate','ADMIN@example.com','admin@example.com',0,0,0,0,'sso')`).Error)
}
