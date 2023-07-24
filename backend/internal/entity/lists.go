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
	filters []model.Filter,
	filterMap map[string]model.FilterMapValue,
) *gorm.DB {
	scopes := make([]func(*gorm.DB) *gorm.DB, 0)
	scopes = append(scopes, ScopeOffsetLimit(pageInfo))
	scopes = append(scopes, ScopeFilters(filters, filterMap))
	return database.GetDB().Scopes(scopes...)
}

// AddOrderToList is used after query above is used for counting
// Postgres in particular doesn't like count(*) when ordering at the same time
func AddOrderToList(
	dbo *gorm.DB,
	pageInfo *model.PageInfo,
	defaultSort model.Sort,
) *gorm.DB {
	return dbo.Scopes(ScopeOrderBy(pageInfo, defaultSort))
}
