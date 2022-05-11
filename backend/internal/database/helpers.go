package database

import (
	"fmt"
	"strings"

	"npm/internal/errors"
	"npm/internal/model"
	"npm/internal/util"
)

const (
	// DateFormat for DateFormat
	DateFormat = "2006-01-02"
	// DateTimeFormat for DateTimeFormat
	DateTimeFormat = "2006-01-02T15:04:05"
)

// GetByQuery returns a row given a query, populating the model given
func GetByQuery(model interface{}, query string, params []interface{}) error {
	db := GetInstance()
	if db != nil {
		err := db.Get(model, query, params...)
		return err
	}

	return errors.ErrDatabaseUnavailable
}

// BuildOrderBySQL takes a `Sort` slice and constructs a query fragment
func BuildOrderBySQL(columns []string, sort *[]model.Sort) (string, []model.Sort) {
	var sortStrings []string
	var newSort []model.Sort
	for _, sortItem := range *sort {
		if util.SliceContainsItem(columns, sortItem.Field) {
			sortStrings = append(sortStrings, fmt.Sprintf("`%s` %s", sortItem.Field, sortItem.Direction))
			newSort = append(newSort, sortItem)
		}
	}

	if len(sortStrings) > 0 {
		return fmt.Sprintf("ORDER BY %s", strings.Join(sortStrings, ", ")), newSort
	}

	return "", newSort
}
