package types

import (
	"database/sql/driver"
	"encoding/json"
	"strconv"
)

// NullableDBUint works with database values that can be null or an integer value
type NullableDBUint struct {
	Uint uint
}

// Value encodes the type ready for the database
func (d NullableDBUint) Value() (driver.Value, error) {
	if d.Uint == 0 {
		return nil, nil
	}
	// According to current database/sql docs, the sql has four builtin functions that
	// returns driver.Value, and the underlying types are `int64`, `float64`, `string` and `bool`
	// nolint: gosec
	return driver.Value(int64(d.Uint)), nil
}

// Scan takes data from the database and modifies it for Go Types
func (d *NullableDBUint) Scan(src any) error {
	var i uint
	switch v := src.(type) {
	case int:
		// nolint: gosec
		i = uint(v)
	case int64:
		// nolint: gosec
		i = uint(v)
	case float32:
		i = uint(v)
	case float64:
		i = uint(v)
	case string:
		a, _ := strconv.Atoi(v)
		// nolint: gosec
		i = uint(a)
	}
	d.Uint = i
	return nil
}

// UnmarshalJSON will unmarshal both database and post given values
func (d *NullableDBUint) UnmarshalJSON(data []byte) error {
	// total_deploy_time: 10,
	// total_deploy_time: null,

	var i uint
	if err := json.Unmarshal(data, &i); err != nil {
		i = 0
		return nil
	}
	d.Uint = i
	return nil
}

// MarshalJSON will marshal for output in api responses
func (d NullableDBUint) MarshalJSON() ([]byte, error) {
	if d.Uint == 0 {
		return json.Marshal(nil)
	}
	return json.Marshal(d.Uint)
}
