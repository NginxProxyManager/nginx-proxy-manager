package secretstore

import (
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	"gorm.io/gorm/schema"
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

func TestWrongLengthValidKeyWithExistingCiphertextFailsOpen(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "db")), &gorm.Config{})
	require.NoError(t, err)
	database.SetDB(db)
	t.Cleanup(func() { database.SetDB(nil) })
	require.NoError(t, db.Exec("CREATE TABLE sso_connection (id TEXT PRIMARY KEY, secret_ciphertext BLOB)").Error)
	dir := t.TempDir()
	store, err := Open(dir)
	require.NoError(t, err)
	ciphertext, err := store.Seal([]byte("provider-secret"), "connection:one")
	require.NoError(t, err)
	require.NoError(t, db.Exec("INSERT INTO sso_connection (id, secret_ciphertext) VALUES (?, ?)", "one", ciphertext).Error)
	require.NoError(t, os.WriteFile(filepath.Join(dir, "keys", "sso.key"), make([]byte, 32), 0600))
	_, err = Open(dir)
	require.ErrorContains(t, err, "key")
}

func TestWrongKeyWithOnlyTransactionCiphertextFailsOpen(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "db")), &gorm.Config{})
	require.NoError(t, err)
	database.SetDB(db)
	t.Cleanup(func() { database.SetDB(nil) })
	require.NoError(t, db.Exec("CREATE TABLE sso_transaction (id TEXT PRIMARY KEY, secret_ciphertext BLOB)").Error)
	dir := t.TempDir()
	store, err := Open(dir)
	require.NoError(t, err)
	ciphertext, err := store.Seal([]byte("nonce-and-verifier"), "transaction:attempt-one")
	require.NoError(t, err)
	require.NoError(t, db.Exec("INSERT INTO sso_transaction (id, secret_ciphertext) VALUES (?, ?)", "attempt-one", ciphertext).Error)
	require.NoError(t, os.WriteFile(filepath.Join(dir, "keys", "sso.key"), make([]byte, 32), 0600))
	_, err = Open(dir)
	require.ErrorContains(t, err, "key")
}

func TestExistingCiphertextValidatesWithProductionNamingStrategy(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "db")), &gorm.Config{
		NamingStrategy: schema.NamingStrategy{NoLowerCase: true},
	})
	require.NoError(t, err)
	database.SetDB(db)
	t.Cleanup(func() { database.SetDB(nil) })
	require.NoError(t, db.Exec("CREATE TABLE sso_connection (id TEXT PRIMARY KEY, secret_ciphertext BLOB)").Error)
	dir := t.TempDir()
	store, err := Open(dir)
	require.NoError(t, err)
	ciphertext, err := store.Seal([]byte("provider-secret"), "connection:one")
	require.NoError(t, err)
	require.NoError(t, db.Exec("INSERT INTO sso_connection (id, secret_ciphertext) VALUES (?, ?)", "one", ciphertext).Error)
	_, err = Open(dir)
	require.NoError(t, err)
}
