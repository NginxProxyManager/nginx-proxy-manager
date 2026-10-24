package jwt

import (
	"crypto/rand"
	"crypto/rsa"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	jwtlib "github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	"npm/internal/database"
	"npm/internal/entity/session"
	"npm/internal/entity/user"
)

func TestGenerateForSessionBindsPurposeAndExpiry(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "jwt.db")), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&user.Model{}, &user.HasCapabilityModel{}, &session.Model{}))
	require.NoError(t, db.Exec("CREATE TABLE auth_policy_fence (id INTEGER PRIMARY KEY, revision BIGINT NOT NULL)").Error)
	require.NoError(t, db.Exec("INSERT INTO auth_policy_fence VALUES (1,1)").Error)
	database.SetDB(db)
	t.Cleanup(func() { database.SetDB(nil) })
	account := user.Model{Name: "Admin", Email: "admin@example.com"}
	require.NoError(t, db.Create(&account).Error)
	id := strings.Repeat("c", 43)
	expires := time.Now().Add(45 * time.Second)
	require.NoError(t, db.Create(&session.Model{ID: id, UserID: account.ID, Source: session.Local, CreatedAt: time.Now().Add(-time.Minute), ExpiresAt: expires}).Error)
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	oldPrivate, oldPublic := privateKey, publicKey
	privateKey, publicKey = key, &key.PublicKey
	t.Cleanup(func() { privateKey, publicKey = oldPrivate, oldPublic })
	for _, tc := range []struct {
		sse    bool
		issuer string
	}{{false, "api"}, {true, "sse"}} {
		response, err := GenerateForSession(account.ID, id, tc.sse)
		require.NoError(t, err)
		require.LessOrEqual(t, response.Expires, expires.Unix())
		claims := &UserJWTClaims{}
		_, err = jwtlib.ParseWithClaims(response.Token, claims, func(*jwtlib.Token) (any, error) { return &key.PublicKey, nil })
		require.NoError(t, err)
		require.Equal(t, id, claims.SessionID)
		require.Equal(t, account.ID, claims.UserID)
		require.Equal(t, tc.issuer, claims.Issuer)
	}
	_, err = GenerateForSession(account.ID+1, id, false)
	require.Error(t, err)
}
