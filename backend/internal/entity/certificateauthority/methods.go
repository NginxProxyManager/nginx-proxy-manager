package certificateauthority

import (
	"database/sql"
	goerrors "errors"
	"fmt"

	"npm/internal/database"
	"npm/internal/entity"
	"npm/internal/errors"
	"npm/internal/logger"
	"npm/internal/model"
)

// GetByID finds a row by ID
func GetByID(id int) (Model, error) {
	var m Model
	err := m.LoadByID(id)
	return m, err
}

// Create will create a row from this model
func Create(ca *Model) (int, error) {
	if ca.ID != 0 {
		return 0, goerrors.New("Cannot create certificate authority when model already has an ID")
	}

	ca.Touch(true)

	db := database.GetInstance()
	// nolint: gosec
	result, err := db.NamedExec(`INSERT INTO `+fmt.Sprintf("`%s`", tableName)+` (
		created_on,
		modified_on,
		name,
		acmesh_server,
		ca_bundle,
		max_domains,
		is_wildcard_supported,
		is_deleted
	) VALUES (
		:created_on,
		:modified_on,
		:name,
		:acmesh_server,
		:ca_bundle,
		:max_domains,
		:is_wildcard_supported,
		:is_deleted
	)`, ca)

	if err != nil {
		return 0, err
	}

	last, lastErr := result.LastInsertId()
	if lastErr != nil {
		return 0, lastErr
	}

	return int(last), nil
}

// Update will Update a row from this model
func Update(ca *Model) error {
	if ca.ID == 0 {
		return goerrors.New("Cannot update certificate authority when model doesn't have an ID")
	}

	ca.Touch(false)

	db := database.GetInstance()
	// nolint: gosec
	_, err := db.NamedExec(`UPDATE `+fmt.Sprintf("`%s`", tableName)+` SET
		created_on = :created_on,
		modified_on = :modified_on,
		name = :name,
		acmesh_server = :acmesh_server,
		ca_bundle = :ca_bundle,
		max_domains = :max_domains,
		is_wildcard_supported = :is_wildcard_supported,
		is_deleted = :is_deleted
	WHERE id = :id`, ca)

	return err
}

// List will return a list of certificates
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
		logger.Error("ListCertificateAuthoritiesError", queryErr)
		logger.Debug("%s -- %+v", query, params)
		return result, queryErr
	}

	// Get rows
	items := make([]Model, 0)
	query, params = entity.ListQueryBuilder(exampleModel, tableName, &pageInfo, defaultSort, filters, getFilterMapFunctions(), false)
	err := db.Select(&items, query, params...)
	if err != nil {
		logger.Error("ListCertificateAuthoritiesError", err)
		logger.Debug("%s -- %+v", query, params)
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
