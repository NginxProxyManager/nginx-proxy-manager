package util

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"go.uber.org/goleak"
)

type rect struct {
	width  int
	height int
}

func TestMapContainsKey(t *testing.T) {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(t, goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	var r rect
	r.width = 5
	r.height = 5
	m := map[string]any{
		"rect_width":  r.width,
		"rect_height": r.height,
	}
	tests := []struct {
		name string
		pass string
		want bool
	}{
		{
			name: "exists",
			pass: "rect_width",
			want: true,
		},
		{
			name: "Does not exist",
			pass: "rect_perimeter",
			want: false,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := MapContainsKey(m, tt.pass)

			assert.Equal(t, result, tt.want)
		})
	}
}
