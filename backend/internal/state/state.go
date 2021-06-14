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

// NewState ...
func NewState() *AppState {
	state := &AppState{
		// buffered channel
		termSig: make(chan bool, 1),
	}
	return state
}

// GetWaitGroup ...
func (state *AppState) GetWaitGroup() *sync.WaitGroup {
	return &state.waitGroup
}

// GetTermSig ...
func (state *AppState) GetTermSig() chan bool {
	return state.termSig
}
