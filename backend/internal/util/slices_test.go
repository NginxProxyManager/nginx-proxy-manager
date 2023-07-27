package util

import (
	"reflect"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestSliceContainsItem(t *testing.T) {
	type want struct {
		result bool
	}
	tests := []struct {
		name        string
		inputString string
		inputArray  []string
		want        want
	}{
		{
			name:        "In array",
			inputString: "test",
			inputArray:  []string{"no", "more", "tests", "test"},
			want: want{
				result: true,
			},
		},
		{
			name:        "Not in array",
			inputString: "test",
			inputArray:  []string{"no", "more", "tests"},
			want: want{
				result: false,
			},
		},
		{
			name:        "Case sensitive",
			inputString: "test",
			inputArray:  []string{"no", "TEST", "more"},
			want: want{
				result: false,
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := SliceContainsItem(tt.inputArray, tt.inputString)
			assert.Equal(t, tt.want.result, got)
		})
	}
}

func TestSliceContainsInt(t *testing.T) {
	type want struct {
		result bool
	}
	tests := []struct {
		name       string
		inputInt   int
		inputArray []int
		want       want
	}{
		{
			name:       "In array",
			inputInt:   1,
			inputArray: []int{1, 2, 3, 4},
			want: want{
				result: true,
			},
		},
		{
			name:       "Not in array",
			inputInt:   1,
			inputArray: []int{10, 2, 3, 4},
			want: want{
				result: false,
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := SliceContainsInt(tt.inputArray, tt.inputInt)
			assert.Equal(t, tt.want.result, got)
		})
	}
}

func TestConvertIntSliceToString(t *testing.T) {
	items := []int{1, 2, 3, 4, 5, 6, 7}
	expectedStr := "1,2,3,4,5,6,7"
	str := ConvertIntSliceToString(items)
	assert.Equal(t, expectedStr, str)
}

func TestConvertStringSliceToInterface(t *testing.T) {
	testCases := []struct {
		input    []string
		expected []interface{}
	}{
		{[]string{"hello", "world"}, []interface{}{"hello", "world"}},
		{[]string{"apple", "banana", "cherry"}, []interface{}{"apple", "banana", "cherry"}},
		{[]string{}, []interface{}{}}, // Empty slice should return an empty slice
	}

	for _, tc := range testCases {
		result := ConvertStringSliceToInterface(tc.input)
		if !reflect.DeepEqual(result, tc.expected) {
			t.Errorf("Expected: %v, Got: %v", tc.expected, result)
		}
	}
}
