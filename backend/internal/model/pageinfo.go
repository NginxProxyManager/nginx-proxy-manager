package model

// PageInfo is the model used by Api Handlers and passed on to other parts
// of the application
type PageInfo struct {
	Sort   []Sort   `json:"sort"`
	Offset int      `json:"offset"`
	Limit  int      `json:"limit"`
	Expand []string `json:"expand"`
}

// Sort holds the sorting data
type Sort struct {
	Field     string `json:"field"`
	Direction string `json:"direction"`
}

// GetSort ...
func (p *PageInfo) GetSort(def Sort) []Sort {
	if p.Sort == nil {
		return []Sort{def}
	}
	return p.Sort
}
