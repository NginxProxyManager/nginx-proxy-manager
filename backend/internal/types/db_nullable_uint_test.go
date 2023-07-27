package types

import (
	"database/sql/driver"
	"testing"
)

func TestNullableDBUint_Value(t *testing.T) {
	tests := []struct {
		name      string
		input     NullableDBUint
		wantValue driver.Value
		wantErr   bool
	}{
		{
			name:      "Value should return nil when Uint is 0",
			input:     NullableDBUint{Uint: 0},
			wantValue: nil,
			wantErr:   false,
		},
		{
			name:      "Value should return int64 value of Uint",
			input:     NullableDBUint{Uint: 10},
			wantValue: int64(10),
			wantErr:   false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotValue, gotErr := tt.input.Value()
			if gotValue != tt.wantValue {
				t.Errorf("Value() = %v, want %v", gotValue, tt.wantValue)
			}
			if (gotErr != nil) != tt.wantErr {
				t.Errorf("Value() error = %v, wantErr %v", gotErr, tt.wantErr)
			}
		})
	}
}

func TestNullableDBUint_Scan(t *testing.T) {
	tests := []struct {
		name     string
		input    interface{}
		wantUint uint
		wantErr  bool
	}{
		{
			name:     "Scan should convert int to uint",
			input:    int(10),
			wantUint: uint(10),
			wantErr:  false,
		},
		{
			name:     "Scan should convert int64 to uint",
			input:    int64(10),
			wantUint: uint(10),
			wantErr:  false,
		},
		// Add more tests for other supported types
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var d NullableDBUint
			err := d.Scan(tt.input)
			if err != nil && !tt.wantErr {
				t.Errorf("Scan() error = %v, wantErr %v", err, tt.wantErr)
			}
			if d.Uint != tt.wantUint {
				t.Errorf("Scan() Uint = %v, want %v", d.Uint, tt.wantUint)
			}
		})
	}
}

func TestNullableDBUint_UnmarshalJSON(t *testing.T) {
	tests := []struct {
		name     string
		input    []byte
		wantUint uint
		wantErr  bool
	}{
		{
			name:     "UnmarshalJSON should unmarshal integer value",
			input:    []byte("10"),
			wantUint: uint(10),
			wantErr:  false,
		},
		{
			name:     "UnmarshalJSON should return zero Uint when data is invalid",
			input:    []byte(`"invalid"`),
			wantUint: uint(0),
			wantErr:  false,
		},
		// Add more tests for other scenarios
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var d NullableDBUint
			err := d.UnmarshalJSON(tt.input)
			if err != nil && !tt.wantErr {
				t.Errorf("UnmarshalJSON() error = %v, wantErr %v", err, tt.wantErr)
			}
			if d.Uint != tt.wantUint {
				t.Errorf("UnmarshalJSON() Uint = %v, want %v", d.Uint, tt.wantUint)
			}
		})
	}
}

func TestNullableDBUint_MarshalJSON(t *testing.T) {
	tests := []struct {
		name       string
		input      NullableDBUint
		wantOutput []byte
		wantErr    bool
	}{
		{
			name:       "MarshalJSON should marshal nil when Uint is 0",
			input:      NullableDBUint{Uint: 0},
			wantOutput: []byte("null"),
			wantErr:    false,
		},
		{
			name:       "MarshalJSON should marshal Uint as JSON value",
			input:      NullableDBUint{Uint: 10},
			wantOutput: []byte("10"),
			wantErr:    false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotOutput, gotErr := tt.input.MarshalJSON()
			if (gotErr != nil) != tt.wantErr {
				t.Errorf("MarshalJSON() error = %v, wantErr %v", gotErr, tt.wantErr)
			}
			if string(gotOutput) != string(tt.wantOutput) {
				t.Errorf("MarshalJSON() output = %s, want %s", gotOutput, tt.wantOutput)
			}
		})
	}
}
