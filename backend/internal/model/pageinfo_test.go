package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"go.uber.org/goleak"
)

func TestPageInfoGetSort(t *testing.T) {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(t, goleak.IgnoreAnyFunction("testing.tRunner.func1"))

	t.Parallel()
	pi := PageInfo{}
	def := Sort{
		Field:     "name",
		Direction: "asc",
	}
	defined := Sort{
		Field:     "email",
		Direction: "desc",
	}
	// default
	sort := pi.GetSort(def)
	assert.Equal(t, sort, []Sort{def})
	// defined
	pi.Sort = []Sort{defined}
	sort = pi.GetSort(def)
	assert.Equal(t, sort, []Sort{defined})
}
