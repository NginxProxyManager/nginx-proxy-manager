package upstream

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

// GetByID finds a Upstream by ID
func GetByID(id int) (Model, error) {
	var m Model
	err := m.LoadByID(id)
	return m, err
}

// create will create a Upstream from this model
func create(u *Model) (int, error) {
	if u.ID != 0 {
		return 0, goerrors.New("Cannot create upstream when model already has an ID")
	}

	u.Touch(true)

	db := database.GetInstance()
	// nolint: gosec
	result, err := db.NamedExec(`INSERT INTO `+fmt.Sprintf("`%s`", tableName)+` (
		created_on,
		modified_on,
		user_id,
		name,
		nginx_template_id,
		ip_hash,
		ntlm,
		keepalive,
		keepalive_requests,
		keepalive_time,
		keepalive_timeout,
		advanced_config,
		status,
		error_message,
		is_deleted
	) VALUES (
		:created_on,
		:modified_on,
		:user_id,
		:name,
		:nginx_template_id,
		:ip_hash,
		:ntlm,
		:keepalive,
		:keepalive_requests,
		:keepalive_time,
		:keepalive_timeout,
		:advanced_config,
		:status,
		:error_message,
		:is_deleted
	)`, u)

	if err != nil {
		return 0, err
	}

	last, lastErr := result.LastInsertId()
	if lastErr != nil {
		return 0, lastErr
	}

	logger.Debug("Created Upstream: %+v", u)

	return int(last), nil
}

// update will Update a Upstream from this model
func update(u *Model) error {
	if u.ID == 0 {
		return goerrors.New("Cannot update upstream when model doesn't have an ID")
	}

	u.Touch(false)

	db := database.GetInstance()
	// nolint: gosec
	_, err := db.NamedExec(`UPDATE `+fmt.Sprintf("`%s`", tableName)+` SET
		created_on = :created_on,
		modified_on = :modified_on,
		user_id = :user_id,
		name = :name,
		nginx_template_id = :nginx_template_id,
		ip_hash = :ip_hash,
		ntlm = :ntlm,
		keepalive = :keepalive,
		keepalive_requests = :keepalive_requests,
		keepalive_time = :keepalive_time,
		advanced_config = :advanced_config,
		status = :status,
		error_message = :error_message,
		is_deleted = :is_deleted
	WHERE id = :id`, u)

	logger.Debug("Updated Upstream: %+v", u)

	return err
}

// List will return a list of Upstreams
func List(pageInfo model.PageInfo, filters []model.Filter, expand []string) (ListResponse, error) {
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
	items := make([]Model, 0)
	query, params = entity.ListQueryBuilder(exampleModel, tableName, &pageInfo, defaultSort, filters, getFilterMapFunctions(), false)
	err := db.Select(&items, query, params...)
	if err != nil {
		logger.Debug("%s -- %+v", query, params)
		return result, err
	}

	// Expand to get servers, at a minimum
	for idx := range items {
		// nolint: errcheck, gosec
		items[idx].Expand(expand)
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
