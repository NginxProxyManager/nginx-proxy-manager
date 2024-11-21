package entity

import (
	"npm/internal/database"
	"npm/internal/model"

	"gorm.io/gorm"
)

// ListResponse is the JSON response for users list
type ListResponse struct {
	Total  int64          `json:"total"`
	Offset int            `json:"offset"`
	Limit  int            `json:"limit"`
	Sort   []model.Sort   `json:"sort"`
	Filter []model.Filter `json:"filter,omitempty"`
	Items  any            `json:"items,omitempty"`
}

// ListQueryBuilder is used to setup queries for lists
func ListQueryBuilder(
	_ *model.PageInfo,
	filters []model.Filter,
	filterMap map[string]model.FilterMapValue,
) *gorm.DB {
	scopes := make([]func(*gorm.DB) *gorm.DB, 0)
	scopes = append(scopes, ScopeFilters(filters, filterMap))
	return database.GetDB().Scopes(scopes...)
}

// AddOrderToList is used after query above is used for counting
// Postgres in particular doesn't like count(*) when ordering at the same time
func AddOrderToList(
	dbo *gorm.DB,
	sort []model.Sort,
	defaultSort model.Sort,
) *gorm.DB {
	return dbo.Scopes(ScopeOrderBy(sort, defaultSort))
}

// AddOffsetLimitToList is used after query above is used for pagination
func AddOffsetLimitToList(
	dbo *gorm.DB,
	pageInfo *model.PageInfo,
) *gorm.DB {
	return dbo.Scopes(ScopeOffsetLimit(pageInfo))
}
