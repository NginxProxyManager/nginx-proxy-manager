package sso

import (
	"context"
	"errors"
	"path/filepath"
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	"npm/internal/database"
)

func TestPolicyWriteRollsBackConfigurationOnFailure(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "policy.db")), &gorm.Config{})
	require.NoError(t, err)
	database.SetDB(db)
	t.Cleanup(func() { database.SetDB(nil); pool, _ := db.DB(); _ = pool.Close() })
	require.NoError(t, db.AutoMigrate(&Policy{}))
	require.NoError(t, db.Create(&Policy{ID: 1, Mode: Parallel, Revision: 1}).Error)
	require.NoError(t, db.Exec("CREATE TABLE auth_policy_fence (id INTEGER PRIMARY KEY, revision BIGINT NOT NULL)").Error)
	require.NoError(t, db.Exec("INSERT INTO auth_policy_fence VALUES (1,1)").Error)
	failure := errors.New("revocation failed")
	require.ErrorIs(t, WithPolicyWrite(context.Background(), func(tx *gorm.DB) error {
		if err := tx.Model(&Policy{}).Where("id = 1").Update("mode", SSOOnly).Error; err != nil {
			return err
		}
		return failure
	}), failure)
	policy, err := GetPolicy(db)
	require.NoError(t, err)
	require.Equal(t, Parallel, policy.Mode)
}
