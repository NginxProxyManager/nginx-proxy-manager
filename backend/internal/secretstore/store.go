// Package secretstore encrypts SSO secrets using an independent installation key.
package secretstore

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"errors"
	"fmt"
	"npm/internal/database"
	"os"
	"path/filepath"
)

type Store struct{ aead cipher.AEAD }

// Open loads the shared installation key. A missing key on a restored database
// containing ciphertext is an error, never permission to replace the key.
func Open(dataDir string) (*Store, error) {
	keyPath := filepath.Join(dataDir, "keys", "sso.key")
	key, err := os.ReadFile(keyPath)
	if errors.Is(err, os.ErrNotExist) {
		exists, checkErr := hasCiphertext()
		if checkErr != nil {
			return nil, checkErr
		}
		if exists {
			return nil, fmt.Errorf("SSO encryption key missing: restore keys/sso.key with the database backup")
		}
		if err := os.MkdirAll(filepath.Dir(keyPath), 0700); err != nil {
			return nil, err
		}
		key = make([]byte, 32)
		if _, err := rand.Read(key); err != nil {
			return nil, err
		}
		// Link publishes the fully written key atomically and cannot overwrite a
		// key another instance already installed. All instances must share keys/.
		file, createErr := os.CreateTemp(filepath.Dir(keyPath), ".sso-key-*")
		if createErr != nil {
			return nil, createErr
		}
		tempPath := file.Name()
		defer os.Remove(tempPath)
		if err := file.Chmod(0600); err != nil {
			file.Close()
			return nil, err
		}
		if _, err := file.Write(key); err != nil {
			file.Close()
			return nil, err
		}
		if err := file.Sync(); err != nil {
			file.Close()
			return nil, err
		}
		if err := file.Close(); err != nil {
			return nil, err
		}
		if err := os.Link(tempPath, keyPath); err != nil && !errors.Is(err, os.ErrExist) {
			return nil, err
		}
		key, err = os.ReadFile(keyPath)
	}
	if err != nil {
		return nil, fmt.Errorf("SSO encryption key: %w", err)
	}
	if len(key) != 32 {
		return nil, fmt.Errorf("SSO encryption key invalid: expected 32 bytes; restore keys/sso.key with the database backup")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	store := &Store{aead: aead}
	if err := store.validateExistingCiphertext(); err != nil {
		return nil, err
	}
	return store, nil
}

func (s *Store) validateExistingCiphertext() error {
	db := database.GetDB()
	if db == nil {
		return nil
	}
	for table, bindingPrefix := range map[string]string{"sso_connection": "connection:", "sso_transaction": "transaction:"} {
		if !db.Migrator().HasTable(table) {
			continue
		}
		var rows []struct {
			ID               string `gorm:"column:id"`
			SecretCiphertext []byte `gorm:"column:secret_ciphertext"`
		}
		if err := db.Table(table).Select("id, secret_ciphertext").Where("secret_ciphertext IS NOT NULL AND LENGTH(secret_ciphertext) > 0").Find(&rows).Error; err != nil {
			return fmt.Errorf("SSO encryption key validation: %w", err)
		}
		for _, row := range rows {
			if _, err := s.Unseal(row.SecretCiphertext, bindingPrefix+row.ID); err != nil {
				return fmt.Errorf("SSO encryption key cannot decrypt stored %s ciphertext: restore keys/sso.key with the database backup", table)
			}
		}
	}
	return nil
}

func hasCiphertext() (bool, error) {
	db := database.GetDB()
	if db == nil {
		return false, nil
	}
	// Configuration secrets and transient login material use this key.
	for table, column := range map[string]string{"sso_connection": "secret_ciphertext", "sso_transaction": "secret_ciphertext"} {
		if !db.Migrator().HasTable(table) {
			continue
		}
		var count int64
		if err := db.Table(table).Where(column + " IS NOT NULL AND LENGTH(" + column + ") > 0").Count(&count).Error; err != nil {
			return false, err
		}
		if count > 0 {
			return true, nil
		}
	}
	return false, nil
}

func (s *Store) Seal(plaintext []byte, binding string) ([]byte, error) {
	if binding == "" {
		return nil, fmt.Errorf("SSO encryption binding required")
	}
	nonce := make([]byte, s.aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}
	return s.aead.Seal(nonce, nonce, plaintext, []byte("npm-sso:v1:"+binding)), nil
}
func (s *Store) Unseal(ciphertext []byte, binding string) ([]byte, error) {
	if binding == "" || len(ciphertext) < s.aead.NonceSize()+s.aead.Overhead() {
		return nil, fmt.Errorf("invalid SSO ciphertext")
	}
	return s.aead.Open(nil, ciphertext[:s.aead.NonceSize()], ciphertext[s.aead.NonceSize():], []byte("npm-sso:v1:"+binding))
}
