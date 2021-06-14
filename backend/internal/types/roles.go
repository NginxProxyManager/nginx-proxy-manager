package types

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
)

// Roles is an array of strings
type Roles []string

// Value encodes the type ready for the database
func (r Roles) Value() (driver.Value, error) {
	roles, err := json.Marshal(r)
	return driver.Value(string(roles)), err
}

// Scan takes data from the database and modifies it for Go Types
func (r *Roles) Scan(src interface{}) error {
	var roles Roles
	var srcString string
	switch v := src.(type) {
	case string:
		srcString = src.(string)
	case []uint8:
		srcString = string(src.([]uint8))
	default:
		return fmt.Errorf("Incompatible type for Roles: %v", v)
	}

	if err := json.Unmarshal([]byte(srcString), &roles); err != nil {
		return err
	}
	*r = roles
	return nil
}
