package setting

import (
	"npm/internal/model"
)

// ListResponse is the JSON response for settings list
type ListResponse struct {
	Total  int            `json:"total"`
	Offset int            `json:"offset"`
	Limit  int            `json:"limit"`
	Sort   []model.Sort   `json:"sort"`
	Filter []model.Filter `json:"filter,omitempty"`
	Items  []Model        `json:"items,omitempty"`
}
