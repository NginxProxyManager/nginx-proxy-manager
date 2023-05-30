package util

import "time"

// UnixMilliToNiceFormat converts a millisecond to nice string
func UnixMilliToNiceFormat(milli int64) string {
	t := time.Unix(0, milli*int64(time.Millisecond))
	return t.Format("2006-01-02 15:04:05")
}
