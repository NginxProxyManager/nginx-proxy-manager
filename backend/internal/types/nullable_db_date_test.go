package types

import (
	"testing"
	"time"

	"go.uber.org/goleak"
)

// TestNullableDBDateValue tests the Value method of the NullableDBDate type
func TestNullableDBDateValue(t *testing.T) {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(t, goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	tme := time.Date(2022, time.January, 1, 0, 0, 0, 0, time.UTC)
	d := NullableDBDate{
		Time: &tme,
	}

	value, err := d.Value()
	if err != nil {
		t.Errorf("Unexpected error: %v", err)
	}

	expectedValue := tme.Unix()

	if value != expectedValue {
		t.Errorf("Incorrect value. Expected: %d, Got: %v", expectedValue, value)
	}
}

// TestNullableDBDateScan tests the Scan method of the NullableDBDate type
func TestNullableDBDateScan(t *testing.T) {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(t, goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	var d NullableDBDate

	err := d.Scan(int64(1640995200))
	if err != nil {
		t.Errorf("Unexpected error: %v", err)
	}

	expectedTime := time.Date(2022, time.January, 1, 0, 0, 0, 0, time.UTC)

	if !expectedTime.Equal(*d.Time) {
		t.Errorf("Incorrect time. Expected: %v, Got: %v", expectedTime, *d.Time)
	}
}

// TestNullableDBDateUnmarshalJSON tests the UnmarshalJSON method of the NullableDBDate type
func TestNullableDBDateUnmarshalJSON(t *testing.T) {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(t, goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	data := []byte(`1640995200`)
	var d NullableDBDate

	err := d.UnmarshalJSON(data)
	if err != nil {
		t.Errorf("Unexpected error: %v", err)
	}

	expectedTime := time.Date(2022, time.January, 1, 0, 0, 0, 0, time.UTC)

	if !expectedTime.Equal(*d.Time) {
		t.Errorf("Incorrect time. Expected: %v, Got: %v", expectedTime, *d.Time)
	}
}

// TestNullableDBDateMarshalJSON tests the MarshalJSON method of the NullableDBDate type
func TestNullableDBDateMarshalJSON(t *testing.T) {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(t, goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	tme := time.Date(2022, time.January, 1, 0, 0, 0, 0, time.UTC)
	d := NullableDBDate{
		Time: &tme,
	}

	result, err := d.MarshalJSON()
	if err != nil {
		t.Errorf("Unexpected error: %v", err)
	}

	expectedResult := []byte(`1640995200`)

	if string(result) != string(expectedResult) {
		t.Errorf("Incorrect result. Expected: %s, Got: %s", expectedResult, result)
	}
}

// TestNullableDBDateAsInt64 tests the AsInt64 method of the NullableDBDate type
func TestNullableDBDateAsInt64(t *testing.T) {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(t, goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	tme := time.Date(2022, time.January, 1, 0, 0, 0, 0, time.UTC)
	d := NullableDBDate{
		Time: &tme,
	}

	unixtime := d.AsInt64()
	expectedUnixtime := tme.Unix()

	if unixtime != expectedUnixtime {
		t.Errorf("Incorrect unixtime. Expected: %d, Got: %d", expectedUnixtime, unixtime)
	}
}

// TestNullableDBDateAsString tests the AsString method of the NullableDBDate type
func TestNullableDBDateAsString(t *testing.T) {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(t, goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	tme := time.Date(2022, time.January, 1, 0, 0, 0, 0, time.UTC)
	d := NullableDBDate{
		Time: &tme,
	}

	str := d.AsString()
	expectedStr := tme.String()

	if str != expectedStr {
		t.Errorf("Incorrect string. Expected: %s, Got: %s", expectedStr, str)
	}
}
