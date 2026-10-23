package serverevents

import (
	"bufio"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"npm/internal/authpolicy"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/go-chi/jwtauth/v5"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"npm/internal/api/middleware"
	"npm/internal/database"
	"npm/internal/entity/session"
	"npm/internal/entity/user"
)

func streamFixture(t *testing.T, capability string) (*gorm.DB, string, http.Handler) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "streams.db")), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&session.Model{}, &user.Model{}, &user.HasCapabilityModel{}))
	require.NoError(t, db.Exec("CREATE TABLE auth_policy_fence (id INTEGER PRIMARY KEY, revision BIGINT NOT NULL)").Error)
	require.NoError(t, db.Exec("INSERT INTO auth_policy_fence VALUES (1,1)").Error)
	database.SetDB(db)
	require.NoError(t, db.Create(&user.Model{Name: "Stream", Email: "stream@example.com"}).Error)
	if capability != "" {
		require.NoError(t, db.Create(&user.HasCapabilityModel{UserID: 1, CapabilityName: capability}).Error)
	}
	id := strings.Repeat("a", 43)
	require.NoError(t, db.Create(&session.Model{ID: id, UserID: 1, Source: session.Local, CreatedAt: time.Now(), ExpiresAt: time.Now().Add(time.Hour)}).Error)
	auth := jwtauth.New("HS256", []byte("test-key"), nil)
	_, token, err := auth.Encode(map[string]any{"uid": 1, "sid": id, "iss": "sse"})
	require.NoError(t, err)
	handler := jwtauth.Verify(auth, jwtauth.TokenFromQuery)(middleware.SSEAuth(Get()))
	t.Cleanup(func() { Shutdown(); database.SetDB(nil); sqlDB, _ := db.DB(); _ = sqlDB.Close() })
	return db, token, handler
}

func TestPendingCannotSubscribe(t *testing.T) {
	_, token, h := streamFixture(t, "")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest("GET", "/?jwt="+token, nil))
	require.Equal(t, 403, w.Code)
}

func TestStreamFiltersProtectedMessages(t *testing.T) {
	_, token, h := streamFixture(t, "certificates.view")
	srv := httptest.NewServer(h)
	defer srv.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, "GET", srv.URL+"?jwt="+token, nil)
	response, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer response.Body.Close()
	SendChange("hosts")
	Send(Message{Type: "unknown", Lang: "secret"}, "")
	SendChange("certificates")
	scanner := bufio.NewScanner(response.Body)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "data:") {
			require.NotContains(t, line, "hosts")
			require.NotContains(t, line, "secret")
			require.Contains(t, line, "certificates")
			return
		}
	}
	t.Fatal("no authorized certificate event")
}

func TestLocalRevocationClosesBeforeHeartbeat(t *testing.T) {
	_, token, h := streamFixture(t, "full-admin")
	srv := httptest.NewServer(h)
	defer srv.Close()
	response, err := http.Get(srv.URL + "?jwt=" + token)
	require.NoError(t, err)
	defer response.Body.Close()
	done := make(chan struct{})
	go func() {
		scanner := bufio.NewScanner(response.Body)
		for scanner.Scan() {
		}
		close(done)
	}()
	require.NoError(t, session.Revoke(context.Background(), strings.Repeat("a", 43), time.Now()))
	select {
	case <-done:
	case <-time.After(500 * time.Millisecond):
		t.Fatal("local revoke did not promptly close stream")
	}
}

// A remote writer owns the database fence before the queued event is consumed.
// Both independent HTTP brokers must reject that event after commit.
func TestQueuedEventsDeniedAfterRemoteCommit(t *testing.T) {
	db, _, _ := streamFixture(t, "full-admin")
	var files []struct{ File string }
	require.NoError(t, db.Raw("PRAGMA database_list").Scan(&files).Error)
	remote, err := gorm.Open(sqlite.Open(files[0].File), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	require.NoError(t, err)
	remoteSQL, _ := remote.DB()
	defer remoteSQL.Close()
	brokers := []*broker{{subscribers: make(map[*subscriber]struct{})}, {subscribers: make(map[*subscriber]struct{})}}
	results := make([]chan string, 0, 2)
	for _, b := range brokers {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			b.ServeHTTP(w, r.WithContext(session.WithPrincipal(r.Context(), session.Principal{Session: session.Model{ID: strings.Repeat("a", 43)}})))
		}))
		defer srv.Close()
		resp, err := http.Get(srv.URL)
		require.NoError(t, err)
		defer resp.Body.Close()
		result := make(chan string, 1)
		results = append(results, result)
		go func() { data, _ := io.ReadAll(resp.Body); result <- string(data) }()
	}
	locked, release, committed := make(chan struct{}), make(chan struct{}), make(chan error, 1)
	go func() {
		committed <- authpolicy.WithDB(context.Background(), remote, func(tx *gorm.DB) error {
			close(locked)
			<-release
			return session.RevokeMatching(tx, session.RevocationFilter{SessionID: strings.Repeat("a", 43)}, time.Now())
		})
	}()
	<-locked
	for _, b := range brokers {
		b.send(event{message: Message{Affects: "certificates"}, data: []byte(`{"affects":"certificates"}`)})
	}
	close(release)
	require.NoError(t, <-committed)
	for _, result := range results {
		select {
		case data := <-result:
			require.NotContains(t, data, "data:")
		case <-time.After(2 * time.Second):
			t.Fatal("remote revoked stream remained open")
		}
	}
}

func TestRemoteRevocationHeartbeatClosesIdleStream(t *testing.T) {
	db, token, h := streamFixture(t, "full-admin")
	srv := httptest.NewServer(h)
	defer srv.Close()
	resp, err := http.Get(srv.URL + "?jwt=" + token)
	require.NoError(t, err)
	defer resp.Body.Close()
	// No local notification: equivalent to a commit from another process.
	require.NoError(t, authpolicy.WithDB(context.Background(), db, func(tx *gorm.DB) error {
		return session.RevokeMatching(tx, session.RevocationFilter{SessionID: strings.Repeat("a", 43)}, time.Now())
	}))
	done := make(chan string, 1)
	go func() { data, _ := io.ReadAll(resp.Body); done <- string(data) }()
	select {
	case data := <-done:
		require.NotContains(t, data, "data:")
	case <-time.After(2 * time.Second):
		t.Fatal("heartbeat did not close revoked stream")
	}
}

func TestFreshCapabilityRemovalFiltersNextPayload(t *testing.T) {
	db, token, h := streamFixture(t, "certificates.view")
	require.NoError(t, db.Create(&user.HasCapabilityModel{UserID: 1, CapabilityName: "hosts.view"}).Error)
	srv := httptest.NewServer(h)
	defer srv.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, "GET", srv.URL+"?jwt="+token, nil)
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.NoError(t, authpolicy.WithDB(context.Background(), db, func(tx *gorm.DB) error {
		return tx.Where("capability_name = ?", "certificates.view").Delete(&user.HasCapabilityModel{}).Error
	}))
	SendChange("certificates")
	SendChange("hosts")
	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "data:") {
			require.Contains(t, line, "hosts")
			require.NotContains(t, line, "certificates")
			return
		}
	}
	t.Fatal("no remaining authorized payload")
}

func TestSlowNetworkWriterDisconnectsWithinDeadline(t *testing.T) {
	_, token, h := streamFixture(t, "full-admin")
	finished := make(chan struct{})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { defer close(finished); h.ServeHTTP(w, r) }))
	defer srv.Close()
	resp, err := http.Get(srv.URL + "?jwt=" + token)
	require.NoError(t, err)
	defer resp.Body.Close()
	// Exceeds TCP send buffers while the client deliberately does not read.
	SendMessage("info", "large", map[string]string{"payload": strings.Repeat("x", 32<<20)})
	select {
	case <-finished:
	case <-time.After(2500 * time.Millisecond):
		t.Fatal("synchronous socket write/flush exceeded deadline")
	}
}

func TestPermissionMappingDoesNotInventViewOrTrustUnknownEvents(t *testing.T) {
	for _, tc := range []struct {
		capability string
		message    Message
		want       bool
	}{
		{"certificates.manage", Message{Affects: "certificates"}, false},
		{"certificates.view", Message{Affects: "certificates"}, true},
		{"full-admin", Message{Affects: "unknown"}, false},
		{"full-admin", Message{Type: "unknown"}, false},
		{"full-admin", Message{Type: "info", Lang: "message"}, true},
		{"certificates.view", Message{Type: "info", Lang: "message"}, false},
		{"full-admin", Message{Affects: "certificates", Type: "unknown"}, false},
		{"settings.manage", Message{Affects: "settings"}, true},
	} {
		require.Equal(t, tc.want, permitted(session.Principal{Capabilities: []string{tc.capability}}, tc.message), "%+v", tc)
	}
}

func TestParentRevocationClosesImpersonatedStream(t *testing.T) {
	db, token, h := streamFixture(t, "full-admin")
	parent := session.Model{ID: strings.Repeat("b", 43), UserID: 1, Source: session.Local, CreatedAt: time.Now(), ExpiresAt: time.Now().Add(time.Hour)}
	require.NoError(t, db.Create(&parent).Error)
	require.NoError(t, db.Model(&session.Model{}).Where("id = ?", strings.Repeat("a", 43)).Updates(map[string]any{"source": session.Impersonation, "parent_id": parent.ID}).Error)
	srv := httptest.NewServer(h)
	defer srv.Close()
	resp, err := http.Get(srv.URL + "?jwt=" + token)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.NoError(t, session.Revoke(context.Background(), parent.ID, time.Now()))
	done := make(chan string, 1)
	go func() { data, _ := io.ReadAll(resp.Body); done <- string(data) }()
	select {
	case data := <-done:
		require.NotContains(t, data, "data:")
	case <-time.After(500 * time.Millisecond):
		t.Fatal("parent revocation did not close child")
	}
}
