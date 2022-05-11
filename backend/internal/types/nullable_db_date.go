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
	return driver.Value(d.Time.Unix()), nil
}

// Scan takes data from the database and modifies it for Go Types
func (d *NullableDBDate) Scan(src interface{}) error {
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
