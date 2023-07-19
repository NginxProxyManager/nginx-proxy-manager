package util

import (
	"bytes"
	"encoding/json"
	"regexp"
	"strings"
	"unicode"

	"npm/internal/logger"
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

// PrettyPrintJSON takes a string and as long as it's JSON,
// it will return a pretty printed and formatted version
func PrettyPrintJSON(s string) string {
	byt := []byte(s)
	var prettyJSON bytes.Buffer
	if err := json.Indent(&prettyJSON, byt, "", "  "); err != nil {
		logger.Debug("Can't pretty print non-json string: %s", s)
		return s
	}

	return prettyJSON.String()
}
