package types

import (
	"database/sql/driver"
	"encoding/json"
	"strconv"
)

// NullableDBInt works with database values that can be null or an integer value
type NullableDBInt struct {
	Int int
}

// Value encodes the type ready for the database
func (d NullableDBInt) Value() (driver.Value, error) {
	if d.Int == 0 {
		return nil, nil
	}
	// According to current database/sql docs, the sql has four builtin functions that
	// returns driver.Value, and the underlying types are `int64`, `float64`, `string` and `bool`
	return driver.Value(int64(d.Int)), nil
}

// Scan takes data from the database and modifies it for Go Types
func (d *NullableDBInt) Scan(src any) error {
	var i int
	switch v := src.(type) {
	case int:
		i = v
	case int64:
		i = int(v)
	case float32:
		i = int(v)
	case float64:
		i = int(v)
	case string:
		i, _ = strconv.Atoi(v)
	}
	d.Int = i
	return nil
}

// UnmarshalJSON will unmarshal both database and post given values
func (d *NullableDBInt) UnmarshalJSON(data []byte) error {
	// total_deploy_time: 10,
	// total_deploy_time: null,

	var i int
	if err := json.Unmarshal(data, &i); err != nil {
		i = 0
		return nil
	}
	d.Int = i
	return nil
}

// MarshalJSON will marshal for output in api responses
func (d NullableDBInt) MarshalJSON() ([]byte, error) {
	if d.Int == 0 {
		return json.Marshal(nil)
	}
	return json.Marshal(d.Int)
}
