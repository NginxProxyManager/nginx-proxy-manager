package util

import (
	"regexp"
	"strings"
	"unicode"
)

// CleanupWhitespace will trim up and remove extra lines and stuff
func CleanupWhitespace(s string) string {
	// Remove trailing whitespace from all lines
	slices := strings.Split(s, "\n")
	for idx := range slices {
		slices[idx] = strings.TrimRightFunc(slices[idx], unicode.IsSpace)
	}
	// Output: [a b c]
	result := strings.Join(slices, "\n")

	// Remove empty lines
	r1 := regexp.MustCompile("\n+")
	result = r1.ReplaceAllString(result, "\n")

	return result
}
