package sso

import (
	"context"
	"crypto/rand"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	"npm/internal/authpolicy"
	"npm/internal/database"
	"npm/internal/entity/session"
	ssoconfig "npm/internal/entity/sso"
)

func TestConcurrentExchangeCreatesOnlyOneSession(t *testing.T) {
	f := fixture(t)
	code := f.complete(t)
	var wg sync.WaitGroup
	errs := make(chan error, 8)
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := f.service.Exchange(context.Background(), code, f.browser)
			errs <- err
		}()
	}
	wg.Wait()
	close(errs)
	success := 0
	for err := range errs {
		if err == nil {
			success++
		} else {
			require.ErrorIs(t, err, ErrDenied)
		}
	}
	require.Equal(t, 1, success)
	var n int64
	require.NoError(t, f.db.Model(&session.Model{}).Count(&n).Error)
	require.Equal(t, int64(1), n)
}
func TestCallbackIsConsumedBeforeProviderReturns(t *testing.T) {
	f := fixture(t)
	_, r := f.begin(t, f.browser)
	entered, release := make(chan struct{}), make(chan struct{})
	f.adapter.barrier = func() { close(entered); <-release }
	done := make(chan error, 1)
	go func() { _, err := f.service.Complete(context.Background(), f.conn, f.browser, r); done <- err }()
	<-entered
	_, err := f.service.Complete(context.Background(), f.conn, f.browser, httptest.NewRequest("GET", r.URL.String(), nil))
	close(release)
	require.ErrorIs(t, err, ErrDenied)
	require.NoError(t, <-done)
}

type barrierEntropy struct{ entered, release chan struct{} }

func (b *barrierEntropy) Read(p []byte) (int, error) {
	close(b.entered)
	<-b.release
	return rand.Read(p)
}
func TestPolicyMutationWinsBeforeExchange(t *testing.T) {
	for _, kind := range []string{"email remove readd", "connection disable reenable"} {
		t.Run(kind, func(t *testing.T) {
			f := fixture(t)
			code := f.complete(t)
			b := &barrierEntropy{entered: make(chan struct{}), release: make(chan struct{})}
			f.service.entropy = b
			done := make(chan error, 1)
			go func() { _, err := f.service.Exchange(context.Background(), code, f.browser); done <- err }()
			<-b.entered
			require.NoError(t, authpolicy.WithDB(context.Background(), f.db, func(tx *gorm.DB) error {
				if err := tx.Table("sso_handoff").Where("1=1").Delete(nil).Error; err != nil {
					return err
				}
				if kind == "email remove readd" {
					if err := tx.Delete(&ssoconfig.AllowlistEntry{}, "email = ?", "allowed@example.com").Error; err != nil {
						return err
					}
					return tx.Create(&ssoconfig.AllowlistEntry{Email: "allowed@example.com"}).Error
				}
				if err := tx.Model(&ssoconfig.Connection{}).Where("id = ?", f.conn).Update("enabled", false).Error; err != nil {
					return err
				}
				return tx.Model(&ssoconfig.Connection{}).Where("id = ?", f.conn).Updates(map[string]any{"enabled": true, "revision": 3}).Error
			}))
			close(b.release)
			require.ErrorIs(t, <-done, ErrDenied)
			var n int64
			require.NoError(t, f.db.Model(&session.Model{}).Count(&n).Error)
			require.Zero(t, n)
			f.service.entropy = rand.Reader
			fresh := f.complete(t)
			_, err := f.service.Exchange(context.Background(), fresh, f.browser)
			require.NoError(t, err)
		})
	}
}
func TestFailedPolicyExchangeCannotRevive(t *testing.T) {
	f := fixture(t)
	code := f.complete(t)
	require.NoError(t, f.db.Model(&ssoconfig.Connection{}).Where("id = ?", f.conn).Update("enabled", false).Error)
	_, err := f.service.Exchange(context.Background(), code, f.browser)
	require.ErrorIs(t, err, ErrDenied)
	require.NoError(t, f.db.Model(&ssoconfig.Connection{}).Where("id = ?", f.conn).Update("enabled", true).Error)
	_, err = f.service.Exchange(context.Background(), code, f.browser)
	require.ErrorIs(t, err, ErrDenied)
}
func TestInjectedDatabaseIsUsedByEveryFence(t *testing.T) {
	f := fixture(t)
	database.SetDB(nil)
	code := f.complete(t)
	_, err := f.service.Exchange(context.Background(), code, f.browser)
	require.NoError(t, err)
}
func TestCookieScopesAndIndependentNames(t *testing.T) {
	a := AttemptCookie(token("a"), token("b"), ssoconfig.OIDC)
	other := AttemptCookie(token("c"), token("d"), ssoconfig.OIDC)
	require.NotEqual(t, a.Name, other.Name)
	require.Equal(t, "/", a.Path)
	require.True(t, strings.HasPrefix(a.Name, "__Host-"))
	require.Equal(t, http.SameSiteLaxMode, a.SameSite)
	require.Equal(t, 300, a.MaxAge)
	saml := AttemptCookie(token("a"), token("b"), ssoconfig.SAML)
	require.Equal(t, http.SameSiteNoneMode, saml.SameSite)
	handoff := HandoffCookie(token("a"), token("b"))
	require.Equal(t, "/", handoff.Path)
	require.True(t, strings.HasPrefix(handoff.Name, "__Host-"))
	require.Equal(t, http.SameSiteLaxMode, handoff.SameSite)
	require.Equal(t, 60, handoff.MaxAge)
	require.NotEqual(t, handoff.Name, HandoffCookie(token("c"), token("b")).Name)
	for _, cookie := range []*http.Cookie{a, saml, handoff} {
		require.True(t, cookie.Secure)
		require.True(t, cookie.HttpOnly)
		require.Empty(t, cookie.Domain)
		require.Equal(t, token("b"), cookie.Value)
		deleted := DeleteCookie(cookie)
		require.Equal(t, cookie.Path, deleted.Path)
		require.Equal(t, cookie.Name, deleted.Name)
		require.Equal(t, -1, deleted.MaxAge)
		require.Empty(t, deleted.Value)
	}
}
func TestAttemptLookupAndCallbackState(t *testing.T) {
	f := fixture(t)
	start, r := f.begin(t, f.browser)
	state, err := CallbackState(r)
	require.NoError(t, err)
	id, err := f.service.AttemptID(context.Background(), f.conn, state)
	require.NoError(t, err)
	require.Equal(t, start.AttemptID, id)
	_, err = f.service.AttemptID(context.Background(), token("x"), state)
	require.ErrorIs(t, err, ErrDenied)
	_, err = CallbackState(httptest.NewRequest("GET", "https://npm.example?state="+state+"&state="+state, nil))
	require.ErrorIs(t, err, ErrDenied)
	post := httptest.NewRequest("POST", "https://npm.example/sso/callback", strings.NewReader("RelayState="+state))
	post.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	got, err := CallbackState(post)
	require.NoError(t, err)
	require.Equal(t, state, got)
	_, err = f.service.Complete(context.Background(), f.conn, f.browser, r)
	require.NoError(t, err)
	_, err = f.service.AttemptID(context.Background(), f.conn, state)
	require.ErrorIs(t, err, ErrDenied)
}
func TestEntropyFailureCannotCreateCredentials(t *testing.T) {
	f := fixture(t)
	f.service.entropy = io.LimitReader(strings.NewReader("short"), 5)
	_, err := f.service.Begin(context.Background(), f.conn, f.browser, "/")
	require.ErrorIs(t, err, ErrDenied)
	var n int64
	require.NoError(t, f.db.Table("sso_transaction").Count(&n).Error)
	require.Zero(t, n)
}
func TestHandoffJustBeforeExpiryAndCosmeticRevision(t *testing.T) {
	f := fixture(t)
	code := f.complete(t)
	require.NoError(t, authpolicy.WithDB(context.Background(), f.db, func(tx *gorm.DB) error {
		if err := tx.Model(&ssoconfig.Connection{}).Where("id = ?", f.conn).Updates(map[string]any{"revision": 2, "name": "Renamed"}).Error; err != nil {
			return err
		}
		return tx.Table("sso_handoff").Where("connection_id = ?", f.conn).Update("connection_revision", 2).Error
	}))
	f.now = f.now.Add(59 * time.Second)
	m, err := f.service.Exchange(context.Background(), code, f.browser)
	require.NoError(t, err)
	require.WithinDuration(t, f.now.Add(24*time.Hour), m.ExpiresAt, time.Microsecond)
}
