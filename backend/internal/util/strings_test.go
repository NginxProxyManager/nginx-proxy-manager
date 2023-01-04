package util

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestCleanupWhitespace(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{
			name: "test a",
			input: `# ------------------------------------------------------------
# Upstream 5: API servers 2
# ------------------------------------------------------------

upstream npm_upstream_5 {` + `  ` + /* this adds whitespace to the end without the ide trimming it */ `









  server 192.168.0.10:80 weight=100 ;
  server 192.168.0.11:80 weight=50 ;

}`,
			want: `# ------------------------------------------------------------
# Upstream 5: API servers 2
# ------------------------------------------------------------
upstream npm_upstream_5 {
  server 192.168.0.10:80 weight=100 ;
  server 192.168.0.11:80 weight=50 ;
}`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			output := CleanupWhitespace(tt.input)
			assert.Equal(t, tt.want, output)
		})
	}
}
