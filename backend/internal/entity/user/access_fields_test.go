package user

import (
	"errors"
	"npm/internal/entity/auth"
	"path/filepath"
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestPopulateAccessFieldsPropagatesCredentialLookupErrors(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "access.db")), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&Model{}, &HasCapabilityModel{}))
	account := Model{Name: "Fixture", Email: "fixture@example.test"}
	require.NoError(t, db.Create(&account).Error)
	require.Error(t, account.PopulateAccessFieldsInTx(db), "a missing production auth table must not look like no credential")
	require.NoError(t, db.AutoMigrate(&auth.Model{}))

	expected := errors.New("auth count unavailable")
	require.NoError(t, db.Callback().Query().Before("gorm:query").Register("test:auth-count-error", func(tx *gorm.DB) {
		if tx.Statement.Table == "auth" {
			tx.AddError(expected)
		}
	}))
	t.Cleanup(func() { _ = db.Callback().Query().Remove("test:auth-count-error") })
	err = account.PopulateAccessFieldsInTx(db)
	require.ErrorIs(t, err, expected)
}
