package config

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"go.uber.org/goleak"
)

func TestAcmeshGetWellknown(t *testing.T) {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(t, goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	a := acmesh{
		Home: "/data/.acme.sh",
	}
	assert.Equal(t, "/data/.acme.sh/.well-known", a.GetWellknown())
}
