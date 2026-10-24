package serverevents

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sync"
	"time"

	"npm/internal/authpolicy"
	"npm/internal/entity/session"
	"npm/internal/entity/user"
)

const defaultChannel = "changes"
const queueSize = 32

// Message preserves the frontend event format.
type Message struct {
	Lang       string            `json:"lang,omitempty"`
	LangParams map[string]string `json:"lang_params,omitempty"`
	Type       string            `json:"type,omitempty"`
	Affects    string            `json:"affects,omitempty"`
}

type event struct {
	message Message
	data    []byte
}
type subscriber struct {
	sessionID string
	queue     chan event
	done      chan struct{}
	once      sync.Once
}

func (s *subscriber) close() { s.once.Do(func() { close(s.done) }) }

type broker struct {
	mu          sync.Mutex
	subscribers map[*subscriber]struct{}
	testGates   map[string]*deliveryGate
}

type deliveryGate struct {
	reached chan struct{}
	release chan struct{}
	once    sync.Once
	timer   *time.Timer
}

// TestDeliveryGate is reachable only through the debug-only full-admin test
// notification handler. Pausing occurs before authorization, never inside the
// policy fence; releasing a queued event still requires current authorization.
func TestDeliveryGate(id, action string) (bool, error) {
	if id == "" || len(id) != 43 {
		return false, errors.New("invalid session")
	}
	b := instance
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.testGates == nil {
		b.testGates = map[string]*deliveryGate{}
	}
	g := b.testGates[id]
	switch action {
	case "pause":
		if g != nil {
			return false, errors.New("gate exists")
		}
		if len(b.testGates) >= 32 {
			return false, errors.New("gate limit")
		}
		g = &deliveryGate{reached: make(chan struct{}), release: make(chan struct{})}
		b.testGates[id] = g
		g.timer = time.AfterFunc(5*time.Second, func() {
			b.mu.Lock()
			defer b.mu.Unlock()
			if b.testGates[id] == g {
				close(g.release)
				delete(b.testGates, id)
			}
		})
		return false, nil
	case "status", "release":
		if g == nil {
			return false, errors.New("gate missing")
		}
		reached := false
		select {
		case <-g.reached:
			reached = true
		default:
		}
		if action == "release" {
			g.timer.Stop()
			close(g.release)
			delete(b.testGates, id)
		}
		return reached, nil
	default:
		return false, errors.New("invalid action")
	}
}

func (b *broker) waitTestGate(r *http.Request, id string) error {
	b.mu.Lock()
	g := b.testGates[id]
	b.mu.Unlock()
	if g == nil {
		return nil
	}
	defer func() {
		b.mu.Lock()
		defer b.mu.Unlock()
		if b.testGates[id] == g {
			g.timer.Stop()
			close(g.release)
			delete(b.testGates, id)
		}
	}()
	g.once.Do(func() { close(g.reached) })
	timer := time.NewTimer(5 * time.Second)
	defer timer.Stop()
	select {
	case <-g.release:
		return nil
	case <-r.Context().Done():
		return r.Context().Err()
	case <-timer.C:
		return errors.New("test gate timeout")
	}
}

var instance = &broker{subscribers: make(map[*subscriber]struct{})}

// Handler serves a bounded, non-replaying stream for an authenticated session.
func Handler() http.Handler { return instance }

// Get remains an alias for callers migrating to Handler.
func Get() http.Handler { return Handler() }

func Shutdown() { instance.shutdown() }
func (b *broker) shutdown() {
	b.mu.Lock()
	defer b.mu.Unlock()
	for s := range b.subscribers {
		s.close()
	}
}
func SendChange(affects string) { Send(Message{Affects: affects}, "") }
func SendMessage(typ, lang string, params map[string]string) {
	Send(Message{Type: typ, Lang: lang, LangParams: params}, "")
}
func Send(msg Message, channel string) {
	if channel != "" && channel != defaultChannel {
		return
	}
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}
	// Copy through JSON so caller mutations cannot race with permission filtering.
	var frozen Message
	if json.Unmarshal(data, &frozen) != nil {
		return
	}
	instance.send(event{message: frozen, data: data})
}
func (b *broker) send(e event) {
	b.mu.Lock()
	defer b.mu.Unlock()
	for s := range b.subscribers {
		select {
		case <-s.done:
		case s.queue <- e:
		default:
			s.close()
		}
	}
}

// Resource notifications require the same explicit capability as their read API.
// Manage is not a substitute for a view capability.
var resourceCapabilities = map[string]string{
	"access-lists":            user.CapabilityAccessListsView,
	"audit-log":               user.CapabilityAuditLogView,
	"certificates":            user.CapabilityCertificatesView,
	"certificate-authorities": user.CapabilityCertificateAuthoritiesView,
	"dns-providers":           user.CapabilityDNSProvidersView,
	"hosts":                   user.CapabilityHostsView,
	"nginx-templates":         user.CapabilityNginxTemplatesView,
	"settings":                user.CapabilitySettingsManage,
	"streams":                 user.CapabilityStreamsView,
	"users":                   user.CapabilityUsersManage,
}

func permitted(p session.Principal, m Message) bool {
	required, known := resourceCapabilities[m.Affects]
	if m.Affects == "" {
		// Unscoped UI notifications may contain administrative details.
		switch m.Type {
		case "success", "error", "warning", "info":
			required = user.CapabilityFullAdmin
			known = true
		}
	} else if m.Type != "" {
		return false
	}
	if !known {
		return false
	}
	for _, c := range p.Capabilities {
		if c == required || c == user.CapabilityFullAdmin {
			return true
		}
	}
	return false
}

func (b *broker) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	p, ok := session.CurrentPrincipal(r.Context())
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	changed, unsubscribe := authpolicy.SubscribeChanges()
	defer unsubscribe()
	p, err := session.Authorize(r.Context(), p.Session.ID, time.Now().UTC())
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if len(p.Capabilities) == 0 {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	controller := http.NewResponseController(w)
	// Unsupported transports fail closed: no protected write can outlive its fence.
	if controller.SetWriteDeadline(time.Now().Add(session.DeliveryTimeout)) != nil {
		http.Error(w, "Streaming unavailable", http.StatusInternalServerError)
		return
	}
	s := &subscriber{sessionID: p.Session.ID, queue: make(chan event, queueSize), done: make(chan struct{})}
	b.mu.Lock()
	b.subscribers[s] = struct{}{}
	b.mu.Unlock()
	defer func() { s.close(); b.mu.Lock(); delete(b.subscribers, s); b.mu.Unlock() }()
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")
	write := func(data []byte) error {
		if err := controller.SetWriteDeadline(time.Now().Add(session.DeliveryTimeout)); err != nil {
			return err
		}
		if _, err := w.Write(data); err != nil {
			return err
		}
		return controller.Flush()
	}
	if write([]byte(": connected\n\n")) != nil {
		return
	}
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case <-s.done:
			return
		case <-changed:
			current, err := session.Authorize(r.Context(), s.sessionID, time.Now().UTC())
			if err != nil || len(current.Capabilities) == 0 {
				return
			}
		case <-ticker.C:
			current, err := session.Authorize(r.Context(), s.sessionID, time.Now().UTC())
			if err != nil || len(current.Capabilities) == 0 {
				return
			}
			if write([]byte(": heartbeat\n\n")) != nil {
				return
			}
		case e := <-s.queue:
			if b.waitTestGate(r, s.sessionID) != nil {
				return
			}
			err := session.WithAuthorizedDelivery(r.Context(), s.sessionID, func(current session.Principal) error {
				if len(current.Capabilities) == 0 {
					return session.ErrUnauthorized
				}
				if !permitted(current, e.message) {
					return nil
				}
				select {
				case <-s.done:
					return session.ErrUnauthorized
				default:
				}
				return write([]byte(fmt.Sprintf("data: %s\n\n", e.data)))
			})
			if err != nil {
				return
			}
		}
	}
}
