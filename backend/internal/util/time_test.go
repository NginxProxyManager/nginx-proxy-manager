package util

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestUnixMilliToNiceFormat(t *testing.T) {
	tests := []struct {
		input    int64
		expected string
	}{
		{0, "1970-01-01 10:00:00"},                   // Unix epoch time
		{1568000000000, "2019-09-09 13:33:20"},       // Arbitrary millisecond timestamp
		{1636598400000, "2021-11-11 12:40:00"},       // Another arbitrary millisecond timestamp
		{-1000000000000, "1938-04-25 08:13:20"},      // Negative millisecond timestamp
		{9223372036854775807, "1970-01-01 09:59:59"}, // Maximum representable millisecond timestamp
	}

	for _, test := range tests {
		output := UnixMilliToNiceFormat(test.input)
		assert.Equal(t, test.expected, output)
	}
}
