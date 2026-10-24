package session

import (
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestPortableSQLiteTimestampColumns(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(t.TempDir()+"/portable.db"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.Exec(`CREATE TABLE session (
		id text primary key, user_id integer not null, source text not null,
		connection_id text not null, login_email text not null, parent_id text not null,
		created_at timestamp not null, expires_at timestamp not null, revoked_at timestamp
	)`).Error)

	created := time.Date(2026, 10, 23, 18, 8, 5, 451057543, time.UTC)
	expires := created.Add(24 * time.Hour)
	id := "nszVBydNcnBc9Xhpz_N_2n9Opmntc7rhqgKA56vElD8"
	require.NoError(t, db.Exec(`INSERT INTO session
		(id,user_id,source,connection_id,login_email,parent_id,created_at,expires_at,revoked_at)
		VALUES (?,?,?,?,?,?,?,?,NULL)`, id, 1, Local, "", "", "", created, expires).Error)

	var loaded Model
	require.NoError(t, db.First(&loaded, "id = ?", id).Error)
	require.True(t, loaded.CreatedAt.Equal(created), "%s != %s", loaded.CreatedAt, created)
	require.True(t, loaded.ExpiresAt.Equal(expires), "%s != %s", loaded.ExpiresAt, expires)
	require.Nil(t, loaded.RevokedAt)

	revoked := expires.Add(-time.Hour)
	require.NoError(t, db.Model(&Model{}).Where("id = ?", id).Update("revoked_at", revoked).Error)
	require.NoError(t, db.First(&loaded, "id = ?", id).Error)
	require.NotNil(t, loaded.RevokedAt)
	require.True(t, loaded.RevokedAt.Equal(revoked), "%s != %s", loaded.RevokedAt, revoked)
}
