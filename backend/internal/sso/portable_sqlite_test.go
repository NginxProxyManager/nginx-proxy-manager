package sso

import (
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestPortableSQLiteTimestampRows(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(t.TempDir()+"/portable.db"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.Exec(`CREATE TABLE sso_transaction (
		id text primary key, connection_id text, browser_hash text, state_hash text,
		secret_ciphertext blob, connection_revision integer, return_path text,
		expires_at timestamp not null, consumed_at timestamp
	)`).Error)
	require.NoError(t, db.Exec(`CREATE TABLE sso_handoff (
		code_hash text primary key, browser_hash text, connection_id text,
		connection_revision integer, user_id integer, login_email text,
		expires_at timestamp not null, consumed_at timestamp
	)`).Error)
	require.NoError(t, db.Exec(`CREATE TABLE sso_replay (
		id text primary key, connection_id text, expires_at timestamp not null
	)`).Error)

	expires := time.Date(2026, 10, 23, 18, 8, 5, 451057543, time.UTC)
	require.NoError(t, db.Create(&transactionRow{ID: "transaction", ExpiresAt: expires}).Error)
	require.NoError(t, db.Create(&handoffRow{CodeHash: "handoff", ExpiresAt: expires}).Error)
	require.NoError(t, db.Create(&replayRow{ID: "replay", ExpiresAt: expires}).Error)

	var transaction transactionRow
	var handoff handoffRow
	var replay replayRow
	require.NoError(t, db.First(&transaction, "id = ?", "transaction").Error)
	require.NoError(t, db.First(&handoff, "code_hash = ?", "handoff").Error)
	require.NoError(t, db.First(&replay, "id = ?", "replay").Error)
	require.True(t, transaction.ExpiresAt.Equal(expires))
	require.True(t, handoff.ExpiresAt.Equal(expires))
	require.True(t, replay.ExpiresAt.Equal(expires))
}
