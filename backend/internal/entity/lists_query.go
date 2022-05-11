package entity

import (
	"fmt"
	"reflect"
	"strings"

	"npm/internal/database"
	"npm/internal/model"
)

// ListQueryBuilder should be able to return the query and params to get items agnostically based
// on given params.
func ListQueryBuilder(modelExample interface{}, tableName string, pageInfo *model.PageInfo, defaultSort model.Sort, filters []model.Filter, filterMapFunctions map[string]FilterMapFunction, returnCount bool) (string, []interface{}) {
	var queryStrings []string
	var whereStrings []string
	var params []interface{}

	if returnCount {
		queryStrings = append(queryStrings, "SELECT COUNT(*)")
	} else {
		queryStrings = append(queryStrings, "SELECT *")
	}

	// nolint: gosec
	queryStrings = append(queryStrings, fmt.Sprintf("FROM `%s`", tableName))

	// Append filters to where clause:
	if filters != nil {
		filterMap := GetFilterMap(modelExample)
		filterQuery, filterParams := GenerateSQLFromFilters(filters, filterMap, filterMapFunctions)
		whereStrings = []string{filterQuery}
		params = append(params, filterParams...)
	}

	// Add is deletee check if model has the field
	if hasDeletedField(modelExample) {
		params = append(params, 0)
		whereStrings = append(whereStrings, "`is_deleted` = ?")
	}

	// Append where clauses to query
	if len(whereStrings) > 0 {
		// nolint: gosec
		queryStrings = append(queryStrings, fmt.Sprintf("WHERE %s", strings.Join(whereStrings, " AND ")))
	}

	if !returnCount {
		var orderBy string
		columns := GetDBColumns(modelExample)
		orderBy, pageInfo.Sort = database.BuildOrderBySQL(columns, &pageInfo.Sort)

		if orderBy != "" {
			queryStrings = append(queryStrings, orderBy)
		} else {
			pageInfo.Sort = append(pageInfo.Sort, defaultSort)
			queryStrings = append(queryStrings, fmt.Sprintf("ORDER BY `%v` COLLATE NOCASE %v", defaultSort.Field, defaultSort.Direction))
		}

		params = append(params, pageInfo.Offset)
		params = append(params, pageInfo.Limit)
		queryStrings = append(queryStrings, "LIMIT ?, ?")
	}

	return strings.Join(queryStrings, " "), params
}

func hasDeletedField(modelExample interface{}) bool {
	t := reflect.TypeOf(modelExample)

	for i := 0; i < t.NumField(); i++ {
		field := t.Field(i)
		dbTag := field.Tag.Get(DBTagName)
		if dbTag == "is_deleted" {
			return true
		}
	}

	return false
}
