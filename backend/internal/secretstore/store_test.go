package secretstore

import (
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	"npm/internal/database"
	"os"
	"path/filepath"
	"testing"
)

func TestEncryptionAndRestart(t *testing.T) {
	database.SetDB(nil)
	dir := t.TempDir()
	store, err := Open(dir)
	require.NoError(t, err)
	sealed, err := store.Seal([]byte("provider-secret"), "connection:one")
	require.NoError(t, err)
	require.NotContains(t, string(sealed), "provider-secret")
	second, err := store.Seal([]byte("provider-secret"), "connection:one")
	require.NoError(t, err)
	require.NotEqual(t, sealed, second)
	restarted, err := Open(dir)
	require.NoError(t, err)
	plain, err := restarted.Unseal(sealed, "connection:one")
	require.NoError(t, err)
	require.Equal(t, "provider-secret", string(plain))
	_, err = restarted.Unseal(sealed, "connection:two")
	require.Error(t, err)
	sealed[len(sealed)-1] ^= 1
	_, err = restarted.Unseal(sealed, "connection:one")
	require.Error(t, err)
}

func TestMissingKeyWithCiphertext(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "db")), &gorm.Config{})
	require.NoError(t, err)
	database.SetDB(db)
	t.Cleanup(func() { database.SetDB(nil) })
	require.NoError(t, db.Exec("CREATE TABLE sso_connection (secret_ciphertext BLOB)").Error)
	require.NoError(t, db.Exec("INSERT INTO sso_connection VALUES (?)", "ciphertext").Error)
	dir := t.TempDir()
	_, err = Open(dir)
	require.Error(t, err)
	_, err = os.Stat(filepath.Join(dir, "keys", "sso.key"))
	require.True(t, os.IsNotExist(err))
}
