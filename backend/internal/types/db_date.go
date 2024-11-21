package types

import (
	"database/sql/driver"
	"encoding/json"
	"time"
)

// DBDate is a date time
// type DBDate time.Time
type DBDate struct {
	Time time.Time
}

// Value encodes the type ready for the database
func (d DBDate) Value() (driver.Value, error) {
	return driver.Value(d.Time.Unix()), nil
}

// Scan takes data from the database and modifies it for Go Types
func (d *DBDate) Scan(src any) error {
	d.Time = time.Unix(src.(int64), 0)
	return nil
}

// UnmarshalJSON will unmarshal both database and post given values
func (d *DBDate) UnmarshalJSON(data []byte) error {
	var u int64
	if err := json.Unmarshal(data, &u); err != nil {
		return err
	}
	d.Time = time.Unix(u, 0)
	return nil
}

// MarshalJSON will marshal for output in api responses
func (d DBDate) MarshalJSON() ([]byte, error) {
	return json.Marshal(d.Time.Unix())
}
