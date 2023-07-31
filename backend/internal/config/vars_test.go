package config

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestAcmeshGetWellknown(t *testing.T) {
	a := acmesh{
		Home: "/data/.acme.sh",
	}
	assert.Equal(t, "/data/.acme.sh/.well-known", a.GetWellknown())
}
