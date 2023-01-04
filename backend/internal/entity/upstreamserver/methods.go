package upstreamserver

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

// GetByID finds a Upstream Server by ID
func GetByID(id int) (Model, error) {
	var m Model
	err := m.LoadByID(id)
	return m, err
}

// GetByUpstreamID finds all servers in the upstream
func GetByUpstreamID(upstreamID int) ([]Model, error) {
	items := make([]Model, 0)
	query := `SELECT * FROM ` + fmt.Sprintf("`%s`", tableName) + ` WHERE upstream_id = ? ORDER BY server`
	db := database.GetInstance()
	err := db.Select(&items, query, upstreamID)
	if err != nil {
		logger.Debug("%s -- %d", query, upstreamID)
	}
	return items, err
}

// create will create a Upstream Server from this model
func create(u *Model) (int, error) {
	if u.ID != 0 {
		return 0, goerrors.New("Cannot create upstream server when model already has an ID")
	}

	u.Touch(true)

	db := database.GetInstance()
	// nolint: gosec
	result, err := db.NamedExec(`INSERT INTO `+fmt.Sprintf("`%s`", tableName)+` (
		created_on,
		modified_on,
		upstream_id,
		server,
		weight,
		max_conns,
		max_fails,
		fail_timeout,
		backup,
		is_deleted
	) VALUES (
		:created_on,
		:modified_on,
		:upstream_id,
		:server,
		:weight,
		:max_conns,
		:max_fails,
		:fail_timeout,
		:backup,
		:is_deleted
	)`, u)

	if err != nil {
		return 0, err
	}

	last, lastErr := result.LastInsertId()
	if lastErr != nil {
		return 0, lastErr
	}

	logger.Debug("Created Upstream Server: %+v", u)

	return int(last), nil
}

// update will Update a Upstream from this model
func update(u *Model) error {
	if u.ID == 0 {
		return goerrors.New("Cannot update upstream server when model doesn't have an ID")
	}

	u.Touch(false)

	db := database.GetInstance()
	// nolint: gosec
	_, err := db.NamedExec(`UPDATE `+fmt.Sprintf("`%s`", tableName)+` SET
		created_on = :created_on,
		modified_on = :modified_on,
		upstream_id = :upstream_id,
		server = :server,
		weight = :weight,
		max_conns = :max_conns,
		max_fails = :max_fails,
		fail_timeout = :fail_timeout,
		backup = :backup,
		is_deleted = :is_deleted
	WHERE id = :id`, u)

	logger.Debug("Updated Upstream Server: %+v", u)

	return err
}

// List will return a list of Upstreams
func List(pageInfo model.PageInfo, filters []model.Filter) (ListResponse, error) {
	var result ListResponse
	var exampleModel Model

	defaultSort := model.Sort{
		Field:     "server",
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
