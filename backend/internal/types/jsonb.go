package types

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
)

// JSONB can be anything
type JSONB struct {
	Encoded string      `json:"decoded"`
	Decoded interface{} `json:"encoded"`
}

// Value encodes the type ready for the database
func (j JSONB) Value() (driver.Value, error) {
	json, err := json.Marshal(j.Decoded)
	return driver.Value(string(json)), err
}

// Scan takes data from the database and modifies it for Go Types
func (j *JSONB) Scan(src interface{}) error {
	var jsonb JSONB
	var srcString string
	switch v := src.(type) {
	case string:
		srcString = src.(string)
	case []uint8:
		srcString = string(src.([]uint8))
	default:
		return fmt.Errorf("Incompatible type for JSONB: %v", v)
	}

	jsonb.Encoded = srcString

	if err := json.Unmarshal([]byte(srcString), &jsonb.Decoded); err != nil {
		return err
	}

	*j = jsonb
	return nil
}

// UnmarshalJSON will unmarshal both database and post given values
func (j *JSONB) UnmarshalJSON(data []byte) error {
	var jsonb JSONB
	jsonb.Encoded = string(data)
	if err := json.Unmarshal(data, &jsonb.Decoded); err != nil {
		return err
	}
	*j = jsonb
	return nil
}

// MarshalJSON will marshal for output in api responses
func (j JSONB) MarshalJSON() ([]byte, error) {
	return json.Marshal(j.Decoded)
}
