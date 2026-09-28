package config

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/goleak"
)

func TestDBConfigFile(t *testing.T) {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(t, goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	Configuration.DataFolder = t.TempDir()
	Configuration.DB = DBConfig{SSLMode: "disable"}

	// No file, no env: stays unconfigured
	require.NoError(t, LoadDBConfig())
	assert.False(t, Configuration.DB.IsConfigured())

	cfg := DBConfig{
		Driver:   DatabasePostgres,
		Host:     "db",
		Port:     5432,
		Username: "npm",
		Password: "secret",
		Name:     "npm",
		SSLMode:  "require",
	}
	require.NoError(t, SaveDBConfig(cfg))

	stat, err := os.Stat(filepath.Join(Configuration.DataFolder, "db.conf"))
	require.NoError(t, err)
	assert.Equal(t, os.FileMode(0600), stat.Mode().Perm())

	require.NoError(t, LoadDBConfig())
	assert.Equal(t, cfg, Configuration.DB)

	require.NoError(t, RemoveDBConfig())
	require.NoError(t, RemoveDBConfig())
	_, err = os.Stat(GetDBConfigFile())
	assert.True(t, os.IsNotExist(err))
}

func TestDBConfigFileEnvPrecedence(t *testing.T) {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(t, goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	Configuration.DataFolder = t.TempDir()
	require.NoError(t, SaveDBConfig(DBConfig{Driver: DatabaseMysql}))

	Configuration.DB = DBConfig{Driver: DatabaseSqlite}
	require.NoError(t, LoadDBConfig())
	assert.Equal(t, DatabaseSqlite, Configuration.DB.Driver)
}

func TestDBConfigFileInvalid(t *testing.T) {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(t, goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	Configuration.DataFolder = t.TempDir()

	Configuration.DB = DBConfig{}
	require.NoError(t, os.WriteFile(GetDBConfigFile(), []byte("not json"), 0600))
	assert.Error(t, LoadDBConfig())

	Configuration.DB = DBConfig{}
	require.NoError(t, os.WriteFile(GetDBConfigFile(), []byte(`{"host":"db"}`), 0600))
	assert.Error(t, LoadDBConfig())
	assert.False(t, Configuration.DB.IsConfigured())
}
