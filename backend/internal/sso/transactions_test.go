package sso

import (
	"context"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	"npm/internal/authpolicy"
	"npm/internal/entity/session"
	ssoconfig "npm/internal/entity/sso"
	"npm/internal/entity/user"
)

func TestTransactionBindingExpiryAndReplay(t *testing.T) {
	for _, kind := range []string{"browser", "connection", "revision", "expiry", "replay", "adapter error"} {
		t.Run(kind, func(t *testing.T) {
			f := fixture(t)
			_, r := f.begin(t, f.browser)
			browser, conn := f.browser, f.conn
			switch kind {
			case "browser":
				browser = token("x")
			case "connection":
				conn = token("x")
			case "revision":
				require.NoError(t, f.db.Model(&ssoconfig.Connection{}).Where("id = ?", f.conn).Update("revision", 2).Error)
			case "expiry":
				f.now = f.now.Add(5 * time.Minute)
			case "replay":
				_, err := f.service.Complete(context.Background(), conn, browser, r)
				require.NoError(t, err)
			case "adapter error":
				f.adapter.fail = true
			}
			_, err := f.service.Complete(context.Background(), conn, browser, r)
			require.ErrorIs(t, err, ErrDenied)
			if kind == "adapter error" {
				f.adapter.fail = false
				_, err = f.service.Complete(context.Background(), conn, browser, r)
				require.ErrorIs(t, err, ErrDenied)
			}
		})
	}
}
func TestIndependentTabsAndBrowsers(t *testing.T) {
	f := fixture(t)
	var codes []string
	for _, browser := range []string{f.browser, f.browser, token("d")} {
		_, r := f.begin(t, browser)
		code, err := f.service.Complete(context.Background(), f.conn, browser, r)
		require.NoError(t, err)
		codes = append(codes, code)
	}
	require.NotEqual(t, codes[0], codes[1])
	for i, browser := range []string{f.browser, f.browser, token("d")} {
		_, err := f.service.Exchange(context.Background(), codes[i], browser)
		require.NoError(t, err)
	}
}
func TestConcurrentFirstCallbacksCreateOneUser(t *testing.T) {
	f := fixture(t)
	_, r1 := f.begin(t, f.browser)
	_, r2 := f.begin(t, f.browser)
	var wg sync.WaitGroup
	errs := make(chan error, 2)
	for _, r := range []string{r1.URL.String(), r2.URL.String()} {
		wg.Add(1)
		go func(raw string) {
			defer wg.Done()
			_, err := f.service.Complete(context.Background(), f.conn, f.browser, httptest.NewRequest("GET", raw, nil))
			errs <- err
		}(r)
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		require.NoError(t, err)
	}
	var count int64
	require.NoError(t, f.db.Model(&user.Model{}).Count(&count).Error)
	require.Equal(t, int64(1), count)
}
func TestPolicyMutationDuringAdapter(t *testing.T) {
	for _, kind := range []string{"remove readd", "disable reenable", "cosmetic"} {
		t.Run(kind, func(t *testing.T) {
			f := fixture(t)
			_, r := f.begin(t, f.browser)
			entered, release := make(chan struct{}), make(chan struct{})
			f.adapter.barrier = func() { close(entered); <-release }
			done := make(chan error, 1)
			go func() { _, err := f.service.Complete(context.Background(), f.conn, f.browser, r); done <- err }()
			<-entered
			require.NoError(t, authpolicy.WithWrite(context.Background(), func(tx *gorm.DB) error {
				if kind == "cosmetic" {
					if err := tx.Table("sso_transaction").Where("connection_id = ?", f.conn).Update("connection_revision", 2).Error; err != nil {
						return err
					}
					return tx.Model(&ssoconfig.Connection{}).Where("id = ?", f.conn).Updates(map[string]any{"name": "Renamed", "revision": 2}).Error
				}
				if err := tx.Table("sso_transaction").Where("1=1").Delete(nil).Error; err != nil {
					return err
				}
				if kind == "disable reenable" {
					return tx.Model(&ssoconfig.Connection{}).Where("id = ?", f.conn).Update("revision", 3).Error
				}
				if err := tx.Delete(&ssoconfig.AllowlistEntry{}, "email = ?", "allowed@example.com").Error; err != nil {
					return err
				}
				return tx.Create(&ssoconfig.AllowlistEntry{Email: "allowed@example.com"}).Error
			}))
			close(release)
			err := <-done
			if kind == "cosmetic" {
				require.NoError(t, err)
			} else {
				require.ErrorIs(t, err, ErrDenied)
				var n int64
				require.NoError(t, f.db.Model(&user.Model{}).Count(&n).Error)
				require.Zero(t, n)
			}
		})
	}
}
func TestReturnPathRejectsBrowserNormalizationBypasses(t *testing.T) {
	f := fixture(t)
	for _, path := range []string{"https://evil.example", "//evil.example", "/\\evil.example", "/%2f%2fevil", "/%252f%252fevil", "/a/../b", "/a/%2e%2e/b", "/a\nLocation:x", "/%0aevil", "relative"} {
		_, err := f.service.Begin(context.Background(), f.conn, f.browser, path)
		require.ErrorIs(t, err, ErrDenied, path)
	}
	for _, path := range []string{"", "/", "/dashboard?tab=hosts", "/hosts/42"} {
		_, err := f.service.Begin(context.Background(), f.conn, f.browser, path)
		require.NoError(t, err, path)
	}
}
func TestOnlyHashesAndEncryptedProtocolMaterialPersist(t *testing.T) {
	f := fixture(t)
	v, r := f.begin(t, f.browser)
	var row struct {
		ID, BrowserHash, StateHash string
		SecretCiphertext           []byte
	}
	require.NoError(t, f.db.Table("sso_transaction").First(&row).Error)
	require.Equal(t, v.AttemptID, row.ID)
	require.Len(t, row.ID, 43)
	require.Len(t, row.BrowserHash, 64)
	require.Len(t, row.StateHash, 64)
	require.NotContains(t, string(row.SecretCiphertext), f.browser)
	require.NotContains(t, string(row.SecretCiphertext), r.URL.Query().Get("state"))
	plain, err := f.key.Unseal(row.SecretCiphertext, "transaction:"+row.ID)
	require.NoError(t, err)
	require.Contains(t, string(plain), "nonce")
	_, err = f.key.Unseal(row.SecretCiphertext, "transaction:other")
	require.Error(t, err)
}
func TestHandoffRevalidationAndSingleUse(t *testing.T) {
	for _, kind := range []string{"expiry", "browser", "revision", "disabled connection", "disabled user", "changed user email", "removed email", "deleted handoff", "replay"} {
		t.Run(kind, func(t *testing.T) {
			f := fixture(t)
			code := f.complete(t)
			browser := f.browser
			switch kind {
			case "expiry":
				f.now = f.now.Add(time.Minute)
			case "browser":
				browser = token("x")
			case "revision":
				require.NoError(t, f.db.Model(&ssoconfig.Connection{}).Where("id = ?", f.conn).Update("revision", 2).Error)
			case "disabled connection":
				require.NoError(t, f.db.Model(&ssoconfig.Connection{}).Where("id = ?", f.conn).Update("enabled", false).Error)
			case "disabled user":
				require.NoError(t, f.db.Model(&user.Model{}).Where("1=1").Update("is_disabled", true).Error)
			case "changed user email":
				require.NoError(t, f.db.Model(&user.Model{}).Where("1=1").Update("normalized_email", "other@example.com").Error)
			case "removed email":
				require.NoError(t, f.db.Delete(&ssoconfig.AllowlistEntry{}, "email = ?", "allowed@example.com").Error)
			case "deleted handoff":
				require.NoError(t, f.db.Table("sso_handoff").Where("1=1").Delete(nil).Error)
			case "replay":
				_, err := f.service.Exchange(context.Background(), code, browser)
				require.NoError(t, err)
			}
			_, err := f.service.Exchange(context.Background(), code, browser)
			require.ErrorIs(t, err, ErrDenied)
			var n int64
			require.NoError(t, f.db.Model(&session.Model{}).Count(&n).Error)
			if kind != "replay" {
				require.Zero(t, n)
			}
		})
	}
}
func TestSAMLReplayPersistedAndScoped(t *testing.T) {
	f := fixture(t)
	f.adapter.identity.ReplayIDs = []ReplayID{{ID: "assertion-id", ExpiresAt: f.now.Add(time.Minute)}}
	f.complete(t)
	_, r := f.begin(t, f.browser)
	_, err := f.service.Complete(context.Background(), f.conn, f.browser, r)
	require.ErrorIs(t, err, ErrDenied)
	var rows []struct {
		ID        string
		ExpiresAt time.Time
	}
	require.NoError(t, f.db.Table("sso_replay").Find(&rows).Error)
	require.Len(t, rows, 1)
	require.Len(t, rows[0].ID, 64)
	require.False(t, strings.Contains(rows[0].ID, "assertion"))
	require.WithinDuration(t, f.now.Add(3*time.Minute), rows[0].ExpiresAt, time.Microsecond)
}

func TestSAMLRequiresSignedReplayIdentifiers(t *testing.T) {
	f := fixture(t)
	require.NoError(t, f.db.Model(&ssoconfig.Connection{}).Where("id = ?", f.conn).Update("protocol", ssoconfig.SAML).Error)
	f.service = NewService(f.db, f.key, map[ssoconfig.Protocol]Adapter{ssoconfig.SAML: f.adapter}, WithClock(func() time.Time { return f.now }))
	_, r := f.begin(t, f.browser)
	_, err := f.service.Complete(context.Background(), f.conn, f.browser, r)
	require.ErrorIs(t, err, ErrDenied)
	var n int64
	require.NoError(t, f.db.Model(&user.Model{}).Count(&n).Error)
	require.Zero(t, n)
}

func TestZeroRevisionCannotBypassRevalidation(t *testing.T) {
	for _, phase := range []string{"callback", "exchange"} {
		t.Run(phase, func(t *testing.T) {
			f := fixture(t)
			if phase == "callback" {
				_, r := f.begin(t, f.browser)
				require.NoError(t, f.db.Table("sso_transaction").Where("1=1").Update("connection_revision", 0).Error)
				_, err := f.service.Complete(context.Background(), f.conn, f.browser, r)
				require.ErrorIs(t, err, ErrDenied)
			} else {
				code := f.complete(t)
				require.NoError(t, f.db.Table("sso_handoff").Where("1=1").Update("connection_revision", 0).Error)
				_, err := f.service.Exchange(context.Background(), code, f.browser)
				require.ErrorIs(t, err, ErrDenied)
			}
		})
	}
}
func TestBeginPrunesExpiredRows(t *testing.T) {
	f := fixture(t)
	f.adapter.identity.ReplayIDs = []ReplayID{{ID: "assertion-id", ExpiresAt: f.now.Add(time.Minute)}}
	f.begin(t, f.browser) // abandoned attempt
	f.complete(t)         // handoff never exchanged
	count := func(table string) int64 {
		var n int64
		require.NoError(t, f.db.Table(table).Count(&n).Error)
		return n
	}
	require.EqualValues(t, 1, count("sso_transaction"))
	require.EqualValues(t, 1, count("sso_handoff"))
	require.EqualValues(t, 1, count("sso_replay"))

	f.now = f.now.Add(10 * time.Minute)
	v, _ := f.begin(t, f.browser)
	var ids []string
	require.NoError(t, f.db.Table("sso_transaction").Pluck("id", &ids).Error)
	require.Equal(t, []string{v.AttemptID}, ids)
	require.Zero(t, count("sso_handoff"))
	require.Zero(t, count("sso_replay"))
}
