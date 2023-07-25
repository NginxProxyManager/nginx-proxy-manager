package context

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestGetString(t *testing.T) {
	t.Run("basic test", func(t *testing.T) {
		assert.Equal(t, "context value: Body", BodyCtxKey.String())
	})
}
