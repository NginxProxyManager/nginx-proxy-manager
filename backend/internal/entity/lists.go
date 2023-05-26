package entity

import (
	"npm/internal/database"
	"npm/internal/model"

	"gorm.io/gorm"
)

// ListableModel is a interface for common use
type ListableModel interface {
	TableName() string
}

// ListResponse is the JSON response for users list
type ListResponse struct {
	Total  int64          `json:"total"`
	Offset int            `json:"offset"`
	Limit  int            `json:"limit"`
	Sort   []model.Sort   `json:"sort"`
	Filter []model.Filter `json:"filter,omitempty"`
	Items  interface{}    `json:"items,omitempty"`
}

// ListQueryBuilder is used to setup queries for lists
func ListQueryBuilder(
	pageInfo *model.PageInfo,
	defaultSort model.Sort,
	filters []model.Filter,
) *gorm.DB {
	scopes := make([]func(*gorm.DB) *gorm.DB, 0)
	scopes = append(scopes, ScopeOrderBy(pageInfo, defaultSort))
	scopes = append(scopes, ScopeOffsetLimit(pageInfo))
	// scopes = append(scopes, ScopeFilters(GetFilterMap(m)))
	return database.GetDB().Scopes(scopes...)
}
