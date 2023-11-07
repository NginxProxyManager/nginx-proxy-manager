package serverevents

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"go.uber.org/goleak"
)

func TestGet(t *testing.T) {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(t, goleak.IgnoreAnyFunction("github.com/jc21/go-sse.(*Server).dispatch"))

	s := Get()
	assert.NotEqual(t, nil, s)
}

// This is just for code coverage more than anything
func TestEverything(t *testing.T) {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(t)

	Get()
	SendMessage("test", "test", map[string]string{"user_id": "10"})
	SendChange("hosts")
	Shutdown()
}
