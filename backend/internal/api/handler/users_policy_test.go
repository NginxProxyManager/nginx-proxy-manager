package handler

import (
	"bytes"
	"context"
	"fmt"
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
	"gorm.io/gorm"
	c "npm/internal/api/context"
	"npm/internal/authpolicy"
	"npm/internal/entity"
	"npm/internal/entity/user"
)

func TestUserPolicyUpdateRollsBackInvalidCapabilities(t *testing.T) {
	db, actorSID := authSessionFixture(t)
	actor := mutationPrincipal(t, actorSID)
	require.NoError(t, db.AutoMigrate(&entity.Capability{}))
	target := user.Model{Name: "Target", Email: "target@example.com", CredentialOrigin: "sso"}
	require.NoError(t, db.Create(&target).Error)
	route := chi.NewRouteContext()
	route.URLParams.Add("userID", "2")
	req := httptest.NewRequest("PUT", "/api/users/2", nil)
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, route)
	ctx = context.WithValue(ctx, c.UserIDCtxKey, uint(1))
	ctx = session.WithPrincipal(ctx, actor)
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
	db, actorSID := authSessionFixture(t)
	actor := mutationPrincipal(t, actorSID)
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
	defer func() { unblock(); srv.Close() }()
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
	ctx = session.WithPrincipal(ctx, actor)
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
	DeleteUsers()(w, req.WithContext(session.WithPrincipal(req.Context(), mutationPrincipal(t, sid))))
	require.Equal(t, 200, w.Code)
	replacement := user.Model{Name: "Replacement", Email: "replacement@example.com",
		ID: 1}
	require.NoError(t, db.Create(&replacement).Error)
	_, err := session.Authorize(context.Background(), sid, time.Now())
	require.ErrorIs(t, err, session.ErrUnauthorized)
}

// stopAtUserMutationFence pauses the real SQLite fence before BEGIN IMMEDIATE.
// Any pre-fence user reads have already happened; reads inside the fence have not.
func stopAtUserMutationFence(t *testing.T, db *gorm.DB, req *http.Request) (*http.Request, <-chan struct{}, func()) {
	t.Helper()
	type barrierKey struct{}
	entered, release := make(chan struct{}), make(chan struct{})
	var once sync.Once
	unblock := func() { once.Do(func() { close(release) }) }
	t.Cleanup(unblock)
	require.NoError(t, db.Callback().Raw().Before("gorm:raw").Register("test:user-mutation-fence", func(tx *gorm.DB) {
		if tx.Statement.Context.Value(barrierKey{}) != nil && tx.Statement.SQL.String() == "BEGIN IMMEDIATE" {
			close(entered)
			<-release
		}
	}))
	return req.WithContext(context.WithValue(req.Context(), barrierKey{}, true)), entered, unblock
}

func userMutationRequest(t *testing.T, sid, target, body string) *http.Request {
	t.Helper()
	p, err := session.Authorize(context.Background(), sid, time.Now())
	require.NoError(t, err)
	route := chi.NewRouteContext()
	route.URLParams.Add("userID", target)
	req := httptest.NewRequest("PUT", "/api/users/"+target, nil)
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, route)
	ctx = context.WithValue(ctx, c.UserIDCtxKey, p.Session.UserID)
	ctx = context.WithValue(ctx, c.BodyCtxKey, []byte(body))
	return req.WithContext(session.WithPrincipal(ctx, p))
}

func TestUserProfileMutationRechecksCommittedPolicy(t *testing.T) {
	for _, scenario := range []string{"self disabled", "actor revoked", "actor permission removed", "target capabilities removed"} {
		t.Run(scenario, func(t *testing.T) {
			db, sid := authSessionFixture(t)
			require.NoError(t, db.AutoMigrate(&entity.Capability{}))
			require.NoError(t, db.Create(&entity.Capability{Name: "certificates.view"}).Error)
			require.NoError(t, db.Create(&entity.Capability{Name: "hosts.view"}).Error)
			target := user.Model{Name: "Target", Email: "target@example.com", CredentialOrigin: "sso"}
			require.NoError(t, db.Create(&target).Error)
			require.NoError(t, db.Create(&user.HasCapabilityModel{UserID: target.ID, CapabilityName: "certificates.view"}).Error)
			targetID := "2"
			if scenario == "self disabled" {
				targetID = "me"
			}
			req := userMutationRequest(t, sid, targetID, `{"name":"Renamed"}`)
			req, entered, release := stopAtUserMutationFence(t, db, req)
			completed := make(chan *httptest.ResponseRecorder, 1)
			go func() { w := httptest.NewRecorder(); UpdateUser()(w, req); completed <- w }()
			select {
			case <-entered:
			case <-time.After(3 * time.Second):
				t.Fatal("mutation did not reach fence")
			}
			require.NoError(t, authpolicy.WithMutation(context.Background(), func(tx *gorm.DB) error {
				switch scenario {
				case "self disabled":
					return tx.Model(&user.Model{}).Where("id = ?", 1).Update("is_disabled", true).Error
				case "actor revoked":
					return session.RevokeMatching(tx, session.RevocationFilter{SessionID: sid}, time.Now())
				case "actor permission removed":
					return tx.Model(&user.HasCapabilityModel{}).Where("user_id = ?", 1).Update("capability_name", "certificates.view").Error
				default:
					return tx.Model(&user.HasCapabilityModel{}).Where("user_id = ?", 2).Update("capability_name", "hosts.view").Error
				}
			}))
			release()
			var w *httptest.ResponseRecorder
			select {
			case w = <-completed:
			case <-time.After(3 * time.Second):
				t.Fatal("mutation did not finish")
			}
			switch scenario {
			case "self disabled":
				require.Equal(t, 401, w.Code)
				var actor user.Model
				require.NoError(t, db.First(&actor, 1).Error)
				require.True(t, actor.IsDisabled)
				require.Equal(t, "Admin", actor.Name)
			case "actor revoked":
				require.Equal(t, 401, w.Code)
			case "actor permission removed":
				require.Equal(t, 403, w.Code)
			default:
				require.Equal(t, 200, w.Code)
				var caps []string
				require.NoError(t, db.Model(&user.HasCapabilityModel{}).Where("user_id = ?", 2).Pluck("capability_name", &caps).Error)
				require.Equal(t, []string{"hosts.view"}, caps)
				require.Contains(t, w.Body.String(), "hosts.view")
				require.NotContains(t, w.Body.String(), "certificates.view")
			}
		})
	}
}

func TestSelfUpdateCannotPersistOrEchoRequestedPolicy(t *testing.T) {
	db, sid := authSessionFixture(t)
	require.NoError(t, db.Model(&user.HasCapabilityModel{}).Where("user_id = ?", 1).Update("capability_name", "certificates.view").Error)
	req := userMutationRequest(t, sid, "me", `{"name":"Renamed","capabilities":["full-admin"]}`)
	w := httptest.NewRecorder()
	UpdateUser()(w, req)
	require.Equal(t, 200, w.Code)
	var actor user.Model
	require.NoError(t, db.First(&actor, 1).Error)
	require.False(t, actor.AdminPasswordEnabled)
	require.NotContains(t, w.Body.String(), "full-admin")
	require.Contains(t, w.Body.String(), "certificates.view")

	req = userMutationRequest(t, sid, "me", `{"password_login_enabled":true}`)
	w = httptest.NewRecorder()
	UpdateUser()(w, req)
	require.Equal(t, http.StatusForbidden, w.Code)
	require.NoError(t, db.First(&actor, 1).Error)
	require.False(t, actor.AdminPasswordEnabled)
}

func mutationPrincipal(t *testing.T, sid string) session.Principal {
	t.Helper()
	p, err := session.Authorize(context.Background(), sid, time.Now())
	require.NoError(t, err)
	return p
}

func TestUserMutationsRequirePrincipalNotOnlyUID(t *testing.T) {
	db, _ := authSessionFixture(t)
	target := user.Model{Name: "Target", Email: "target@example.com", CredentialOrigin: "sso"}
	require.NoError(t, db.Create(&target).Error)
	for _, handler := range []http.HandlerFunc{UpdateUser(), DeleteUser(), DeleteUsers()} {
		route := chi.NewRouteContext()
		route.URLParams.Add("userID", "2")
		req := httptest.NewRequest("PUT", "/api/users/2", nil)
		ctx := context.WithValue(req.Context(), chi.RouteCtxKey, route)
		ctx = context.WithValue(ctx, c.UserIDCtxKey, uint(1))
		ctx = context.WithValue(ctx, c.BodyCtxKey, []byte(`{"name":"Renamed"}`))
		w := httptest.NewRecorder()
		handler(w, req.WithContext(ctx))
		require.Equal(t, 401, w.Code)
	}
}

func TestDeleteRevalidatesActorWaitingForFence(t *testing.T) {
	for _, bulk := range []bool{false, true} {
		t.Run(fmt.Sprint(bulk), func(t *testing.T) {
			db, sid := authSessionFixture(t)
			require.NoError(t, db.AutoMigrate(&auth.Model{}))
			target := user.Model{Name: "Target", Email: "target@example.com", CredentialOrigin: "sso"}
			require.NoError(t, db.Create(&target).Error)
			req := userMutationRequest(t, sid, "2", `{}`)
			req, entered, release := stopAtUserMutationFence(t, db, req)
			completed := make(chan int, 1)
			go func() {
				w := httptest.NewRecorder()
				if bulk {
					DeleteUsers()(w, req)
				} else {
					DeleteUser()(w, req)
				}
				completed <- w.Code
			}()
			select {
			case <-entered:
			case <-time.After(3 * time.Second):
				t.Fatal("deletion did not reach fence")
			}
			require.NoError(t, session.Revoke(context.Background(), sid, time.Now()))
			release()
			select {
			case status := <-completed:
				require.Equal(t, 401, status)
			case <-time.After(3 * time.Second):
				t.Fatal("deletion did not finish")
			}
			require.NoError(t, db.First(&target, 2).Error)
		})
	}
}

func TestSelfFullAdminRemovalGuardUsesFreshCapabilities(t *testing.T) {
	_, sid := authSessionFixture(t)
	for _, target := range []string{"me", "1"} {
		req := userMutationRequest(t, sid, target, `{"name":"Renamed","capabilities":["hosts.view"]}`)
		w := httptest.NewRecorder()
		UpdateUser()(w, req)
		require.Equal(t, 400, w.Code)
		require.Contains(t, w.Body.String(), "You cannot remove your own full-admin capability!")
	}
	p, err := session.Authorize(context.Background(), sid, time.Now())
	require.NoError(t, err)
	require.Equal(t, []string{"full-admin"}, p.Capabilities)
}

func TestPasswordLoginToggleRequiresFullAdminActorAndTarget(t *testing.T) {
	db, sid := authSessionFixture(t)
	target := user.Model{Name: "Target", Email: "target@example.com", CredentialOrigin: "sso"}
	require.NoError(t, db.Create(&target).Error)

	request := func(body string) *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		UpdateUser()(w, userMutationRequest(t, sid, "2", body))
		return w
	}

	w := request(`{"password_login_enabled":true}`)
	require.Equal(t, http.StatusForbidden, w.Code, "a non-full-admin target cannot receive the exception")

	require.NoError(t, db.Create(&user.HasCapabilityModel{UserID: target.ID, CapabilityName: user.CapabilityFullAdmin}).Error)
	require.NoError(t, db.Model(&user.HasCapabilityModel{}).Where("user_id = ?", 1).Update("capability_name", user.CapabilityUsersManage).Error)
	w = request(`{"password_login_enabled":true}`)
	require.Equal(t, http.StatusForbidden, w.Code, "users.manage cannot control the full-admin password exception")

	require.NoError(t, db.Model(&user.HasCapabilityModel{}).Where("user_id = ?", 1).Update("capability_name", user.CapabilityFullAdmin).Error)
	w = request(`{"password_login_enabled":true}`)
	require.Equal(t, http.StatusOK, w.Code)
	require.NoError(t, db.First(&target, target.ID).Error)
	require.True(t, target.AdminPasswordEnabled)
}

func TestSoleFullAdminCanControlOwnExceptionThroughAdminOperation(t *testing.T) {
	db, sid := authSessionFixture(t)
	for _, enabled := range []bool{false, true} {
		w := httptest.NewRecorder()
		UpdateUser()(w, userMutationRequest(t, sid, "1", fmt.Sprintf(`{"password_login_enabled":%t}`, enabled)))
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		var actor user.Model
		require.NoError(t, db.First(&actor, 1).Error)
		require.Equal(t, enabled, actor.AdminPasswordEnabled)
		capabilities, err := user.GetCapabilitiesInTx(db, 1)
		require.NoError(t, err)
		require.Equal(t, []string{user.CapabilityFullAdmin}, capabilities)
	}
}

func TestAdminProvisioningTransitionsSSOCredentialOrigin(t *testing.T) {
	db, sid := authSessionFixture(t)
	require.NoError(t, db.AutoMigrate(&auth.Model{}))
	target := user.Model{Name: "Pending SSO", Email: "pending-sso@example.com", CredentialOrigin: "sso"}
	require.NoError(t, db.Create(&target).Error)
	route := chi.NewRouteContext()
	route.URLParams.Add("userID", "2")
	req := httptest.NewRequest(http.MethodPost, "/api/users/2/auth", nil)
	ctx := context.WithValue(req.Context(), chi.RouteCtxKey, route)
	ctx = context.WithValue(ctx, c.UserIDCtxKey, uint(1))
	ctx = session.WithPrincipal(ctx, mutationPrincipal(t, sid))
	ctx = context.WithValue(ctx, c.BodyCtxKey, []byte(`{"type":"local","secret":"strong-passphrase"}`))
	w := httptest.NewRecorder()
	SetAuth()(w, req.WithContext(ctx))
	require.Equal(t, http.StatusOK, w.Code)
	require.NoError(t, db.First(&target, target.ID).Error)
	require.Equal(t, "local", target.CredentialOrigin)
	require.NoError(t, target.PopulateAccessFieldsInTx(db))
	require.True(t, target.HasLocalCredential)
	require.True(t, target.CanSetLocalPassword)
	localAuth, err := auth.GetByUserIDType(target.ID, auth.TypeLocal)
	require.NoError(t, err)
	require.NoError(t, localAuth.ValidateSecret("strong-passphrase"))
}
