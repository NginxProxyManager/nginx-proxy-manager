package host

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

// GetByID finds a Host by ID
func GetByID(id int) (Model, error) {
	var m Model
	err := m.LoadByID(id)
	return m, err
}

// create will create a Host from this model
func create(host *Model) (int, error) {
	if host.ID != 0 {
		return 0, goerrors.New("Cannot create host when model already has an ID")
	}

	host.Touch(true)

	db := database.GetInstance()
	// nolint: gosec
	result, err := db.NamedExec(`INSERT INTO `+fmt.Sprintf("`%s`", tableName)+` (
		created_on,
		modified_on,
		user_id,
		type,
		host_template_id,
		listen_interface,
		domain_names,
		upstream_id,
		certificate_id,
		access_list_id,
		ssl_forced,
		caching_enabled,
		block_exploits,
		allow_websocket_upgrade,
		http2_support,
		hsts_enabled,
		hsts_subdomains,
		paths,
		upstream_options,
		advanced_config,
		is_disabled,
		is_deleted
	) VALUES (
		:created_on,
		:modified_on,
		:user_id,
		:type,
		:host_template_id,
		:listen_interface,
		:domain_names,
		:upstream_id,
		:certificate_id,
		:access_list_id,
		:ssl_forced,
		:caching_enabled,
		:block_exploits,
		:allow_websocket_upgrade,
		:http2_support,
		:hsts_enabled,
		:hsts_subdomains,
		:paths,
		:upstream_options,
		:advanced_config,
		:is_disabled,
		:is_deleted
	)`, host)

	if err != nil {
		return 0, err
	}

	last, lastErr := result.LastInsertId()
	if lastErr != nil {
		return 0, lastErr
	}

	return int(last), nil
}

// update will Update a Host from this model
func update(host *Model) error {
	if host.ID == 0 {
		return goerrors.New("Cannot update host when model doesn't have an ID")
	}

	host.Touch(false)

	db := database.GetInstance()
	// nolint: gosec
	_, err := db.NamedExec(`UPDATE `+fmt.Sprintf("`%s`", tableName)+` SET
		created_on = :created_on,
		modified_on = :modified_on,
		user_id = :user_id,
		type = :type,
		host_template_id = :host_template_id,
		listen_interface = :listen_interface,
		domain_names = :domain_names,
		upstream_id = :upstream_id,
		certificate_id = :certificate_id,
		access_list_id = :access_list_id,
		ssl_forced = :ssl_forced,
		caching_enabled = :caching_enabled,
		block_exploits = :block_exploits,
		allow_websocket_upgrade = :allow_websocket_upgrade,
		http2_support = :http2_support,
		hsts_enabled = :hsts_enabled,
		hsts_subdomains = :hsts_subdomains,
		paths = :paths,
		upstream_options = :upstream_options,
		advanced_config = :advanced_config,
		is_disabled = :is_disabled,
		is_deleted = :is_deleted
	WHERE id = :id`, host)

	return err
}

// List will return a list of hosts
func List(pageInfo model.PageInfo, filters []model.Filter, expand []string) (ListResponse, error) {
	var result ListResponse
	var exampleModel Model

	defaultSort := model.Sort{
		Field:     "domain_names",
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

	if expand != nil {
		for idx := range items {
			expandErr := items[idx].Expand(expand)
			if expandErr != nil {
				logger.Error("HostsExpansionError", expandErr)
			}
		}
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
