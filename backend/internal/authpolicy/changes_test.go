package authpolicy

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	"npm/internal/database"
)

func TestChangeHintsOnlyAfterSuccessfulMutationCommit(t *testing.T) {
	db, _ := fenceDB(t)
	database.SetDB(db)
	defer database.SetDB(nil)
	changed, unsubscribe := SubscribeChanges()
	defer unsubscribe()
	assertQuiet := func() {
		t.Helper()
		select {
		case <-changed:
			t.Fatal("notification without committed mutation")
		default:
		}
	}
	failure := errors.New("rollback")
	require.ErrorIs(t, WithMutation(context.Background(), func(*gorm.DB) error { assertQuiet(); return failure }), failure)
	assertQuiet()
	ctx, cancel := context.WithCancel(context.Background())
	require.Error(t, WithMutation(ctx, func(*gorm.DB) error { cancel(); return nil }))
	assertQuiet()
	require.NoError(t, WithWrite(context.Background(), func(*gorm.DB) error { return nil }))
	assertQuiet()
	require.NoError(t, WithMutation(context.Background(), func(*gorm.DB) error { assertQuiet(); return nil }))
	select {
	case <-changed:
	default:
		t.Fatal("missing committed mutation hint")
	}
}
