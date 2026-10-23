package handler

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"npm/internal/entity/auth"
	"npm/internal/entity/session"
	"npm/internal/serverevents"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/require"
	c "npm/internal/api/context"
	"npm/internal/entity"
	"npm/internal/entity/user"
)

func TestUserPolicyUpdateRollsBackInvalidCapabilities(t *testing.T) {
	db, _ := authSessionFixture(t)
	require.NoError(t, db.AutoMigrate(&entity.Capability{}))
	target := user.Model{Name: "Target", Email: "target@example.com", CredentialOrigin: "sso"}
	require.NoError(t, db.Create(&target).Error)
	route := chi.NewRouteContext()
	route.URLParams.Add("userID", "2")
	req := httptest.NewRequest("PUT", "/api/users/2", nil)
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, route)
	ctx = context.WithValue(ctx, c.UserIDCtxKey, uint(1))
	ctx = context.WithValue(ctx, c.BodyCtxKey, []byte(`{"is_disabled":true,"capabilities":["unknown"]}`))
	w := httptest.NewRecorder()
	UpdateUser()(w, req.WithContext(ctx))
	require.Equal(t, 400, w.Code)
	require.NoError(t, db.First(&target, target.ID).Error)
	require.False(t, target.IsDisabled, "failed capability validation must roll back the entire policy mutation")
}

type deliveryBarrierWriter struct {
	http.ResponseWriter
	entered chan struct{}
	release chan struct{}
	once    sync.Once
}

func (w *deliveryBarrierWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }
func (w *deliveryBarrierWriter) Write(data []byte) (int, error) {
	if bytes.HasPrefix(data, []byte("data:")) {
		w.once.Do(func() { close(w.entered); <-w.release })
	}
	return w.ResponseWriter.Write(data)
}

func TestUserDisableAPIWaitsForProtectedDeliveryFence(t *testing.T) {
	db, _ := authSessionFixture(t)
	require.NoError(t, db.AutoMigrate(&entity.Capability{}))
	target := user.Model{Name: "Target", Email: "target@example.com", CredentialOrigin: "sso"}
	require.NoError(t, db.Create(&target).Error)
	require.NoError(t, db.Create(&user.HasCapabilityModel{UserID: target.ID, CapabilityName: "certificates.view"}).Error)
	sid := strings.Repeat("a", 43)
	require.NoError(t, db.Create(&session.Model{ID: sid, UserID: target.ID, Source: session.Local, CreatedAt: time.Now(), ExpiresAt: time.Now().Add(time.Hour)}).Error)
	entered, release := make(chan struct{}), make(chan struct{})
	var releaseOnce sync.Once
	unblock := func() { releaseOnce.Do(func() { close(release) }) }
	defer unblock()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writer := &deliveryBarrierWriter{ResponseWriter: w, entered: entered, release: release}
		serverevents.Handler().ServeHTTP(writer, r.WithContext(session.WithPrincipal(r.Context(), session.Principal{Session: session.Model{ID: sid}})))
	}))
	defer srv.Close()
	resp, err := http.Get(srv.URL)
	require.NoError(t, err)
	defer resp.Body.Close()
	serverevents.SendChange("certificates")
	select {
	case <-entered:
	case <-time.After(2 * time.Second):
		t.Fatal("delivery never entered")
	}
	route := chi.NewRouteContext()
	route.URLParams.Add("userID", "2")
	req := httptest.NewRequest("PUT", "/api/users/2", nil)
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, route)
	ctx = context.WithValue(ctx, c.UserIDCtxKey, uint(1))
	ctx = context.WithValue(ctx, c.BodyCtxKey, []byte(`{"is_disabled":true,"capabilities":[]}`))
	completed := make(chan int, 1)
	go func() { w := httptest.NewRecorder(); UpdateUser()(w, req.WithContext(ctx)); completed <- w.Code }()
	select {
	case status := <-completed:
		t.Fatalf("policy API completed during protected delivery: %d", status)
	case <-time.After(100 * time.Millisecond):
	}
	unblock()
	select {
	case status := <-completed:
		require.Equal(t, 200, status)
	case <-time.After(2 * time.Second):
		t.Fatal("policy API did not complete after delivery")
	}
	serverevents.SendChange("certificates")
	data, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	require.Equal(t, 1, strings.Count(string(data), "data:"), "only the pre-commit protected write may reach the client")
}

func TestDebugDeleteCannotReviveSessionsWhenUserIDIsReused(t *testing.T) {
	db, sid := authSessionFixture(t)
	require.NoError(t, db.AutoMigrate(&auth.Model{}))
	req := httptest.NewRequest("DELETE", "/api/users", nil)
	w := httptest.NewRecorder()
	DeleteUsers()(w, req)
	require.Equal(t, 200, w.Code)
	replacement := user.Model{Name: "Replacement", Email: "replacement@example.com"}
	replacement.ID = 1
	require.NoError(t, db.Create(&replacement).Error)
	_, err := session.Authorize(context.Background(), sid, time.Now())
	require.ErrorIs(t, err, session.ErrUnauthorized)
}
