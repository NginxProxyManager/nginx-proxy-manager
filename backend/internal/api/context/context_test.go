package context

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"go.uber.org/goleak"
)

func TestGetString(t *testing.T) {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(t, goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	t.Run("basic test", func(t *testing.T) {
		assert.Equal(t, "context value: Body", BodyCtxKey.String())
	})
}
