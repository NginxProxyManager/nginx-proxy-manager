package authpolicy

import (
	"context"
	"gorm.io/gorm"
	"sync"
)

var changes = struct {
	sync.Mutex
	listeners map[chan struct{}]struct{}
}{listeners: make(map[chan struct{}]struct{})}

// SubscribeChanges is only a wakeup hint. Receivers must independently authorize.
func SubscribeChanges() (<-chan struct{}, func()) {
	ch := make(chan struct{}, 1)
	changes.Lock()
	changes.listeners[ch] = struct{}{}
	changes.Unlock()
	return ch, func() { changes.Lock(); delete(changes.listeners, ch); changes.Unlock() }
}

// WithMutation publishes only after a successful fenced policy commit. Ordinary
// authorization and delivery must use WithWrite, which never publishes.
func WithMutation(ctx context.Context, fn func(*gorm.DB) error) error {
	if err := WithWrite(ctx, fn); err != nil {
		return err
	}
	changes.Lock()
	defer changes.Unlock()
	for ch := range changes.listeners {
		select {
		case ch <- struct{}{}:
		default:
		}
	}
	return nil
}
