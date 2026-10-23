package sso

import (
	"github.com/stretchr/testify/require"
	"testing"
)

func TestNormalizeEmail(t *testing.T) {
	got, err := NormalizeEmail(" User@Example.COM ")
	require.NoError(t, err)
	require.Equal(t, "user@example.com", got)
	for _, value := range []string{"@example.com", "*@example.com", "example.com", "Name <user@example.com>", "a@b,c@d"} {
		_, err := NormalizeEmail(value)
		require.Error(t, err, value)
	}
}
