package entity

import (
	"strings"

	"npm/internal/model"

	"gorm.io/gorm"
)

func ScopeOffsetLimit(pageInfo *model.PageInfo) func(db *gorm.DB) *gorm.DB {
	return func(db *gorm.DB) *gorm.DB {
		if pageInfo.Offset > 0 || pageInfo.Limit > 0 {
			return db.Limit(pageInfo.Limit).Offset(pageInfo.Offset)
		}
		return db
	}
}

func ScopeOrderBy(pageInfo *model.PageInfo, defaultSort model.Sort) func(db *gorm.DB) *gorm.DB {
	return func(db *gorm.DB) *gorm.DB {
		if pageInfo.Sort != nil {
			// Sort by items in slice
			return db.Order(sortToOrderString(pageInfo.Sort))
		} else if defaultSort.Field != "" {
			// Default to this sort
			str := defaultSort.Field
			if defaultSort.Direction != "" {
				str = str + " " + defaultSort.Direction
			}
			return db.Order(str)
		}
		return db
	}
}

func ScopeFilters(filters map[string]string) func(db *gorm.DB) *gorm.DB {
	return func(db *gorm.DB) *gorm.DB {
		// todo
		/*
			if filters != nil {
				filterMap := GetFilterMap(m)
				filterQuery, filterParams := GenerateSQLFromFilters(filters, filterMap, filterMapFunctions)
				whereStrings = []string{filterQuery}
				params = append(params, filterParams...)
			}
		*/
		return db
	}
}

func sortToOrderString(sorts []model.Sort) string {
	strs := make([]string, 0)
	for _, i := range sorts {
		str := i.Field
		if i.Direction != "" {
			str = str + " " + i.Direction
		}
		strs = append(strs, str)
	}
	return strings.Join(strs, ", ")
}
