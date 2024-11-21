package types

import (
	"database/sql/driver"
	"encoding/json"
	"time"
)

// NullableDBDate is a date time that can be null in the db
// type DBDate time.Time
type NullableDBDate struct {
	Time *time.Time
}

// Value encodes the type ready for the database
func (d NullableDBDate) Value() (driver.Value, error) {
	if d.Time == nil {
		return nil, nil
	}
	// According to current database/sql docs, the sql has four builtin functions that
	// returns driver.Value, and the underlying types are `int64`, `float64`, `string` and `bool`
	return driver.Value(d.Time.Unix()), nil
}

// Scan takes data from the database and modifies it for Go Types
func (d *NullableDBDate) Scan(src any) error {
	var tme time.Time
	if src != nil {
		tme = time.Unix(src.(int64), 0)
	}

	d.Time = &tme
	return nil
}

// UnmarshalJSON will unmarshal both database and post given values
func (d *NullableDBDate) UnmarshalJSON(data []byte) error {
	var t time.Time
	var u int64
	if err := json.Unmarshal(data, &u); err != nil {
		d.Time = &t
		return nil
	}
	t = time.Unix(u, 0)
	d.Time = &t
	return nil
}

// MarshalJSON will marshal for output in api responses
func (d NullableDBDate) MarshalJSON() ([]byte, error) {
	if d.Time == nil || d.Time.IsZero() {
		return json.Marshal(nil)
	}

	return json.Marshal(d.Time.Unix())
}

// AsInt64 will attempt to return a unixtime
func (d NullableDBDate) AsInt64() int64 {
	if d.Time == nil || d.Time.IsZero() {
		return 0
	}

	return d.Time.Unix()
}

// AsString returns date as a string
func (d NullableDBDate) AsString() string {
	if d.Time == nil || d.Time.IsZero() {
		return ""
	}

	return d.Time.String()
}
