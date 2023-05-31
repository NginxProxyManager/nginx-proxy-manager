package entity

import (
	"fmt"
	"strings"

	"npm/internal/database"
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

func ScopeFilters(filters []model.Filter, filterMap map[string]filterMapValue) func(db *gorm.DB) *gorm.DB {
	return func(db *gorm.DB) *gorm.DB {
		like := database.GetCaseInsensitiveLike()
		for _, f := range filters {
			// Lookup this filter field from the name map
			if _, ok := filterMap[f.Field]; ok {
				f.Field = filterMap[f.Field].Field
			}

			// For boolean fields, the value needs tweaking
			if filterMap[f.Field].Type == "boolean" {
				f.Value = parseBoolValue(f.Value[0])
			}

			// Quick adjustments for commonalities
			if f.Modifier == "in" && len(f.Value) == 1 {
				f.Modifier = "equals"
			} else if f.Modifier == "notin" && len(f.Value) == 1 {
				f.Modifier = "not"
			}

			switch strings.ToLower(f.Modifier) {
			case "not":
				db.Where(fmt.Sprintf("%s != ?", f.Field), f.Value)
			case "min":
				db.Where(fmt.Sprintf("%s >= ?", f.Field), f.Value)
			case "max":
				db.Where(fmt.Sprintf("%s <= ?", f.Field), f.Value)
			case "greater":
				db.Where(fmt.Sprintf("%s > ?", f.Field), f.Value)
			case "lesser":
				db.Where(fmt.Sprintf("%s < ?", f.Field), f.Value)

			// LIKE modifiers:
			case "contains":
				db.Where(fmt.Sprintf("%s %s ?", f.Field, like), `%`+f.Value[0]+`%`)
			case "starts":
				db.Where(fmt.Sprintf("%s %s ?", f.Field, like), f.Value[0]+`%`)
			case "ends":
				db.Where(fmt.Sprintf("%s %s ?", f.Field, like), `%`+f.Value[0])

			// Array parameter modifiers:
			case "in":
				db.Where(fmt.Sprintf("%s IN ?", f.Field), f.Value)
			case "notin":
				db.Where(fmt.Sprintf("%s NOT IN ?", f.Field), f.Value)

			// Default: equals
			default:
				db.Where(fmt.Sprintf("%s = ?", f.Field), f.Value)
			}
		}
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

func parseBoolValue(v string) []string {
	bVal := "0"
	switch strings.ToLower(v) {
	case "yes":
		fallthrough
	case "true":
		fallthrough
	case "on":
		fallthrough
	case "t":
		fallthrough
	case "1":
		fallthrough
	case "y":
		bVal = "1"
	}
	return []string{bVal}
}
