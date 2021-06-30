package state

import (
	"sync"
)

// AppState holds pointers to channels and waitGroups
// shared by all goroutines of the application
type AppState struct {
	waitGroup sync.WaitGroup
	termSig   chan bool
}

// NewState creates a new app state
func NewState() *AppState {
	state := &AppState{
		// buffered channel
		termSig: make(chan bool, 1),
	}
	return state
}

// GetWaitGroup returns the state's wg
func (state *AppState) GetWaitGroup() *sync.WaitGroup {
	return &state.waitGroup
}

// GetTermSig returns the state's term signal
func (state *AppState) GetTermSig() chan bool {
	return state.termSig
}
