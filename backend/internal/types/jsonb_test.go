package types

import (
	"encoding/json"
	"testing"
)

// TestJSONBValue tests the Value method of the JSONB type
func TestJSONBValue(t *testing.T) {
	j := JSONB{
		Decoded: map[string]any{
			"name": "John",
			"age":  30,
		},
	}

	value, err := j.Value()
	if err != nil {
		t.Errorf("Unexpected error: %v", err)
	}

	// nolint: goconst
	if value != `{"age":30,"name":"John"}` {
		t.Errorf("Incorrect value. Expected: %s, Got: %s", `{"name":"John","age":30}`, value)
	}
}

// TestJSONBScan tests the Scan method of the JSONB type
func TestJSONBScan(t *testing.T) {
	src := `{"name":"John","age":30}`
	var j JSONB

	err := j.Scan(src)
	if err != nil {
		t.Errorf("Unexpected error: %v", err)
	}

	expectedDecoded := map[string]any{
		"name": "John",
		"age":  30,
	}

	if !jsonEqual(j.Decoded, expectedDecoded) {
		t.Errorf("Incorrect decoded value. Expected: %v, Got: %v", expectedDecoded, j.Decoded)
	}

	if j.Encoded != src {
		t.Errorf("Incorrect encoded value. Expected: %s, Got: %s", src, j.Encoded)
	}
}

// TestJSONBUnmarshalJSON tests the UnmarshalJSON method of the JSONB type
func TestJSONBUnmarshalJSON(t *testing.T) {
	data := []byte(`{"name":"John","age":30}`)
	var j JSONB

	err := j.UnmarshalJSON(data)
	if err != nil {
		t.Errorf("Unexpected error: %v", err)
	}

	expectedDecoded := map[string]any{
		"name": "John",
		"age":  30,
	}

	if !jsonEqual(j.Decoded, expectedDecoded) {
		t.Errorf("Incorrect decoded value. Expected: %v, Got: %v", expectedDecoded, j.Decoded)
	}

	if j.Encoded != string(data) {
		t.Errorf("Incorrect encoded value. Expected: %s, Got: %s", string(data), j.Encoded)
	}
}

// TestJSONBMarshalJSON tests the MarshalJSON method of the JSONB type
func TestJSONBMarshalJSON(t *testing.T) {
	j := JSONB{
		Decoded: map[string]any{
			"name": "John",
			"age":  30,
		},
	}

	result, err := j.MarshalJSON()
	if err != nil {
		t.Errorf("Unexpected error: %v", err)
	}

	expectedResult := `{"age":30,"name":"John"}`

	if string(result) != expectedResult {
		t.Errorf("Incorrect result. Expected: %s, Got: %s", expectedResult, string(result))
	}
}

// TestJSONBAsStringArray tests the AsStringArray method of the JSONB type
func TestJSONBAsStringArray(t *testing.T) {
	j := JSONB{
		Decoded: []string{"apple", "banana", "orange"},
	}

	strs, err := j.AsStringArray()
	if err != nil {
		t.Errorf("Unexpected error: %v", err)
	}

	expectedStrs := []string{"apple", "banana", "orange"}

	if !stringSliceEqual(strs, expectedStrs) {
		t.Errorf("Incorrect result. Expected: %v, Got: %v", expectedStrs, strs)
	}
}

// Helper function to compare JSON objects
func jsonEqual(a, b any) bool {
	aJSON, _ := json.Marshal(a)
	bJSON, _ := json.Marshal(b)
	return string(aJSON) == string(bJSON)
}

// Helper function to compare string slices
func stringSliceEqual(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
