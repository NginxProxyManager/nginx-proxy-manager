package model

// Filter is the structure of a field/modifier/value item
type Filter struct {
	Field    string   `json:"field"`
	Modifier string   `json:"modifier"`
	Value    []string `json:"value"`
}

// FilterMapValue is the structure of a filter map value
type FilterMapValue struct {
	Type   string
	Field  string
	Schema string
	Model  string
}
