package types

import (
	"encoding/json"
	"testing"
	"time"

	"go.uber.org/goleak"
)

func TestDBDate_Value(t *testing.T) {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(t, goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	// Create a DBDate instance with a specific time
	expectedTime := time.Date(2022, time.January, 1, 0, 0, 0, 0, time.UTC)
	dbDate := DBDate{Time: expectedTime}

	// Call the Value method
	value, err := dbDate.Value()

	// Assert the value and error
	if err != nil {
		t.Errorf("Unexpected error: %v", err)
	}

	// Convert the value to int64
	unixTime := value.(int64)

	// Convert the unix time back to time.Time
	actualTime := time.Unix(unixTime, 0)

	// Compare the actual time with the expected time
	if !actualTime.Equal(expectedTime) {
		t.Errorf("Expected time '%v', got '%v'", expectedTime, actualTime)
	}
}

func TestDBDate_Scan(t *testing.T) {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(t, goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	// Simulate a value from the database (unix timestamp)
	unixTime := int64(1640995200)

	// Create a DBDate instance
	dbDate := DBDate{}

	// Call the Scan method
	err := dbDate.Scan(unixTime)

	// Assert the error
	if err != nil {
		t.Errorf("Unexpected error: %v", err)
	}

	// Convert the DBDate's time to unix timestamp for comparison
	actualUnixTime := dbDate.Time.Unix()

	// Compare the actual unix time with the expected unix time
	if actualUnixTime != unixTime {
		t.Errorf("Expected unix time '%v', got '%v'", unixTime, actualUnixTime)
	}
}

func TestDBDate_UnmarshalJSON(t *testing.T) {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(t, goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	// Simulate a JSON input representing a unix timestamp
	jsonData := []byte("1640995200")

	// Create a DBDate instance
	dbDate := DBDate{}

	// Call the UnmarshalJSON method
	err := dbDate.UnmarshalJSON(jsonData)

	// Assert the error
	if err != nil {
		t.Errorf("Unexpected error: %v", err)
	}

	// Convert the DBDate's time to unix timestamp for comparison
	actualUnixTime := dbDate.Time.Unix()

	// Compare the actual unix time with the expected unix time
	expectedUnixTime := int64(1640995200)
	if actualUnixTime != expectedUnixTime {
		t.Errorf("Expected unix time '%v', got '%v'", expectedUnixTime, actualUnixTime)
	}
}

func TestDBDate_MarshalJSON(t *testing.T) {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(t, goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	// Create a DBDate instance with a specific time
	expectedTime := time.Date(2022, time.January, 1, 0, 0, 0, 0, time.UTC)
	dbDate := DBDate{Time: expectedTime}

	// Call the MarshalJSON method
	jsonData, err := dbDate.MarshalJSON()

	// Assert the value and error
	if err != nil {
		t.Errorf("Unexpected error: %v", err)
	}

	// Convert the JSON data to an integer
	var actualUnixTime int64
	err = json.Unmarshal(jsonData, &actualUnixTime)
	if err != nil {
		t.Errorf("Failed to unmarshal JSON data: %v", err)
	}

	// Convert the unix time back to time.Time
	actualTime := time.Unix(actualUnixTime, 0)

	// Compare the actual time with the expected time
	if !actualTime.Equal(expectedTime) {
		t.Errorf("Expected time '%v', got '%v'", expectedTime, actualTime)
	}
}
