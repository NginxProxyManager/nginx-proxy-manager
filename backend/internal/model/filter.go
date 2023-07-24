package model

// Filter is the structure of a field/modifier/value item
type Filter struct {
	Field    string   `json:"field"`
	Modifier string   `json:"modifier"`
	Value    []string `json:"value"`
}

// FilterMapValue ...
type FilterMapValue struct {
	Type   string
	Field  string
	Schema string
	Model  string
}
