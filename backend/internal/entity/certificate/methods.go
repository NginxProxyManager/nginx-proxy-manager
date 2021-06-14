package certificate

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
func Create(certificate *Model) (int, error) {
	if certificate.ID != 0 {
		return 0, goerrors.New("Cannot create certificate when model already has an ID")
	}

	certificate.Touch(true)

	db := database.GetInstance()
	// nolint: gosec
	result, err := db.NamedExec(`INSERT INTO `+fmt.Sprintf("`%s`", tableName)+` (
		created_on,
		modified_on,
		user_id,
		type,
		certificate_authority_id,
		dns_provider_id,
		name,
		domain_names,
		expires_on,
		status,
		meta,
		is_deleted
	) VALUES (
		:created_on,
		:modified_on,
		:user_id,
		:type,
		:certificate_authority_id,
		:dns_provider_id,
		:name,
		:domain_names,
		:expires_on,
		:status,
		:meta,
		:is_deleted
	)`, certificate)

	if err != nil {
		return 0, err
	}

	last, lastErr := result.LastInsertId()
	if lastErr != nil {
		return 0, lastErr
	}

	return int(last), nil
}

// Update will Update a Auth from this model
func Update(certificate *Model) error {
	if certificate.ID == 0 {
		return goerrors.New("Cannot update certificate when model doesn't have an ID")
	}

	certificate.Touch(false)

	db := database.GetInstance()
	// nolint: gosec
	_, err := db.NamedExec(`UPDATE `+fmt.Sprintf("`%s`", tableName)+` SET
		created_on = :created_on,
		modified_on = :modified_on,
		type = :type,
		user_id = :user_id,
		certificate_authority_id = :certificate_authority_id,
		dns_provider_id = :dns_provider_id,
		name = :name,
		domain_names = :domain_names,
		expires_on = :expires_on,
		status = :status,
		meta = :meta,
		is_deleted = :is_deleted
	WHERE id = :id`, certificate)

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
		logger.Debug("%s -- %+v", query, params)
		return result, queryErr
	}

	// Get rows
	var items []Model
	query, params = entity.ListQueryBuilder(exampleModel, tableName, &pageInfo, defaultSort, filters, getFilterMapFunctions(), false)
	err := db.Select(&items, query, params...)
	if err != nil {
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

// GetByStatus will select rows that are ready for requesting
func GetByStatus(status string) ([]Model, error) {
	models := make([]Model, 0)
	db := database.GetInstance()

	query := fmt.Sprintf(`
	SELECT
		t.*
	FROM "%s" t
	INNER JOIN "dns_provider" d ON d."id" = t."dns_provider_id"
	INNER JOIN "certificate_authority" c ON c."id" = t."certificate_authority_id"
	WHERE
		t."type" IN ("http", "dns") AND
		t."status" = ? AND
		t."certificate_authority_id" > 0 AND
		t."dns_provider_id" > 0 AND
		t."is_deleted" = 0
	`, tableName)

	params := []interface{}{StatusReady}
	err := db.Select(&models, query, params...)
	if err != nil && err != sql.ErrNoRows {
		logger.Error("GetByStatusError", err)
		logger.Debug("Query: %s -- %+v", query, params)
	}

	return models, err
}
