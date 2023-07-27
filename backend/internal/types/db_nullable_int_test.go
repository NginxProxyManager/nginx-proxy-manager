package types

import (
	"testing"
)

func TestNullableDBIntValue(t *testing.T) {
	var d NullableDBInt

	// Test when Int is 0 (null)
	d.Int = 0
	value, err := d.Value()
	if value != nil || err != nil {
		t.Errorf("Expected Value() to return nil, nil but got %v, %v", value, err)
	}

	// Test when Int is not null
	d.Int = 10
	value, err = d.Value()
	if value != int64(10) || err != nil {
		t.Errorf("Expected Value() to return 10, nil but got %v, %v", value, err)
	}
}

func TestNullableDBIntScan(t *testing.T) {
	var d NullableDBInt

	// Test when src is an int
	err := d.Scan(20)
	if d.Int != 20 || err != nil {
		t.Errorf("Expected Scan(20) to set d.Int to 20 and return nil but got d.Int = %d, err = %v", d.Int, err)
	}

	// Test when src is an int64
	err = d.Scan(int64(30))
	if d.Int != 30 || err != nil {
		t.Errorf("Expected Scan(int64(30)) to set d.Int to 30 and return nil but got d.Int = %d, err = %v", d.Int, err)
	}

	// Test when src is a float32
	err = d.Scan(float32(40))
	if d.Int != 40 || err != nil {
		t.Errorf("Expected Scan(float32(40)) to set d.Int to 40 and return nil but got d.Int = %d, err = %v", d.Int, err)
	}

	// Test when src is a float64
	err = d.Scan(float64(50))
	if d.Int != 50 || err != nil {
		t.Errorf("Expected Scan(float64(50)) to set d.Int to 50 and return nil but got d.Int = %d, err = %v", d.Int, err)
	}

	// Test when src is a string
	err = d.Scan("60")
	if d.Int != 60 || err != nil {
		t.Errorf("Expected Scan(\"60\") to set d.Int to 60 and return nil but got d.Int = %d, err = %v", d.Int, err)
	}
}

func TestNullableDBIntUnmarshalJSON(t *testing.T) {
	var d NullableDBInt

	// Test when data is an integer value
	err := d.UnmarshalJSON([]byte("10"))
	if d.Int != 10 || err != nil {
		t.Errorf("Expected UnmarshalJSON([]byte(\"10\")) to set d.Int to 10 and return nil but got d.Int = %d, err = %v", d.Int, err)
	}

	// Test when data is null
	err = d.UnmarshalJSON([]byte("null"))
	if d.Int != 0 || err != nil {
		t.Errorf("Expected UnmarshalJSON([]byte(\"null\")) to set d.Int to 0 and return nil but got d.Int = %d, err = %v", d.Int, err)
	}
}

func TestNullableDBIntMarshalJSON(t *testing.T) {
	var d NullableDBInt

	// Test when Int is 0 (null)
	d.Int = 0
	result, err := d.MarshalJSON()
	if string(result) != "null" || err != nil {
		t.Errorf("Expected MarshalJSON() to return \"null\", nil but got %s, %v", result, err)
	}

	// Test when Int is not null
	d.Int = 10
	result, err = d.MarshalJSON()
	if string(result) != "10" || err != nil {
		t.Errorf("Expected MarshalJSON() to return \"10\", nil but got %s, %v", result, err)
	}
}
