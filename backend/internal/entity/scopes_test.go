package entity

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestParseBoolValue(t *testing.T) {
	tests := []struct {
		input    string
		expected []string
	}{
		{"yes", []string{"1"}},
		{"true", []string{"1"}},
		{"on", []string{"1"}},
		{"t", []string{"1"}},
		{"1", []string{"1"}},
		{"y", []string{"1"}},
		{"no", []string{"0"}},
		{"false", []string{"0"}},
		{"off", []string{"0"}},
		{"f", []string{"0"}},
		{"0", []string{"0"}},
		{"n", []string{"0"}},
		{"random", []string{"0"}},
	}

	for _, test := range tests {
		result := parseBoolValue(test.input)
		assert.Equal(t, test.expected, result, "Input: %s", test.input)
	}
}
