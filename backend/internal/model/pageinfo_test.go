package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestPageInfoGetSort(t *testing.T) {
	t.Parallel()
	pi := PageInfo{}
	def := Sort{
		Field:     "name",
		Direction: "asc",
	}
	defined := Sort{
		Field:     "nickname",
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
