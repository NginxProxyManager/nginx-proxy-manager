package serverevents

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestGet(t *testing.T) {
	s := Get()
	assert.NotEqual(t, nil, s)
}

// This is just for code coverage more than anything
func TestEverything(t *testing.T) {
	Get()
	SendMessage("test", "test", map[string]string{"user_id": "10"})
	SendChange("hosts")
	Shutdown()
}
