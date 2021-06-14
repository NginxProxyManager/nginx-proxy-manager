package setting

import (
	"database/sql"
	goerrors "errors"
	"fmt"

	"npm/internal/database"
	"npm/internal/entity"
	"npm/internal/errors"
	"npm/internal/model"
)

// GetByID finds a setting by ID
func GetByID(id int) (Model, error) {
	var m Model
	err := m.LoadByID(id)
	return m, err
}

// GetByName finds a setting by name
func GetByName(name string) (Model, error) {
	var m Model
	err := m.LoadByName(name)
	return m, err
}

// Create will Create a Setting from this model
func Create(setting *Model) (int, error) {
	if setting.ID != 0 {
		return 0, goerrors.New("Cannot create setting when model already has an ID")
	}

	setting.Touch(true)

	db := database.GetInstance()
	// nolint: gosec
	result, err := db.NamedExec(`INSERT INTO `+fmt.Sprintf("`%s`", tableName)+` (
		created_on,
		modified_on,
		name,
		value
	) VALUES (
		:created_on,
		:modified_on,
		:name,
		:value
	)`, setting)

	if err != nil {
		return 0, err
	}

	last, lastErr := result.LastInsertId()
	if lastErr != nil {
		return 0, lastErr
	}

	return int(last), nil
}

// Update will Update a Setting from this model
func Update(setting *Model) error {
	if setting.ID == 0 {
		return goerrors.New("Cannot update setting when model doesn't have an ID")
	}

	setting.Touch(false)

	db := database.GetInstance()
	// nolint: gosec
	_, err := db.NamedExec(`UPDATE `+fmt.Sprintf("`%s`", tableName)+` SET
		created_on = :created_on,
		modified_on = :modified_on,
		name = :name,
		value = :value
	WHERE id = :id`, setting)

	return err
}

// List will return a list of settings
func List(pageInfo model.PageInfo, filters []model.Filter) (ListResponse, error) {
	var result ListResponse
	var exampleModel Model

	defaultSort := model.Sort{
		Field:     "name",
		Direction: "ASC",
	}

	db := database.GetInstance()
	if db == nil {
		return result, errors.ErrDatabaseUnavailable
	}

	// Get count of items in this search
	query, params := entity.ListQueryBuilder(exampleModel, tableName, &pageInfo, defaultSort, filters, getFilterMapFunctions(), true)
	countRow := db.QueryRowx(query, params...)
	var totalRows int
	queryErr := countRow.Scan(&totalRows)
	if queryErr != nil && queryErr != sql.ErrNoRows {
		return result, queryErr
	}

	// Get rows
	var items []Model
	query, params = entity.ListQueryBuilder(exampleModel, tableName, &pageInfo, defaultSort, filters, getFilterMapFunctions(), false)
	err := db.Select(&items, query, params...)
	if err != nil {
		return result, err
	}

	result = ListResponse{
		Items:  items,
		Total:  totalRows,
		Limit:  pageInfo.Limit,
		Offset: pageInfo.Offset,
		Sort:   pageInfo.Sort,
		Filter: filters,
	}

	return result, nil
}
