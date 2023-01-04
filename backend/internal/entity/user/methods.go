package user

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

// GetByID finds a user by ID
func GetByID(id int) (Model, error) {
	var m Model
	err := m.LoadByID(id)
	return m, err
}

// GetByEmail finds a user by email
func GetByEmail(email string) (Model, error) {
	var m Model
	err := m.LoadByEmail(email)
	return m, err
}

// Create will create a User from given model
func Create(user *Model) (int, error) {
	// We need to ensure that a user can't be created with the same email
	// as an existing non-deleted user. Usually you would do this with the
	// database schema, but it's a bit more complex because of the is_deleted field.

	if user.ID != 0 {
		return 0, goerrors.New("Cannot create user when model already has an ID")
	}

	// Check if an existing user with this email exists
	_, err := GetByEmail(user.Email)
	if err == nil {
		return 0, errors.ErrDuplicateEmailUser
	}

	user.Touch(true)

	db := database.GetInstance()
	// nolint: gosec
	result, err := db.NamedExec(`INSERT INTO `+fmt.Sprintf("`%s`", tableName)+` (
		created_on,
		modified_on,
		name,
		nickname,
		email,
		is_disabled
	) VALUES (
		:created_on,
		:modified_on,
		:name,
		:nickname,
		:email,
		:is_disabled
	)`, user)

	if err != nil {
		return 0, err
	}

	last, lastErr := result.LastInsertId()
	if lastErr != nil {
		return 0, lastErr
	}

	return int(last), nil
}

// Update will Update a User from this model
func Update(user *Model) error {
	if user.ID == 0 {
		return goerrors.New("Cannot update user when model doesn't have an ID")
	}

	// Check that the email address isn't associated with another user
	if existingUser, _ := GetByEmail(user.Email); existingUser.ID != 0 && existingUser.ID != user.ID {
		return errors.ErrDuplicateEmailUser
	}

	user.Touch(false)

	db := database.GetInstance()
	// nolint: gosec
	_, err := db.NamedExec(`UPDATE `+fmt.Sprintf("`%s`", tableName)+` SET
		created_on = :created_on,
		modified_on = :modified_on,
		name = :name,
		nickname = :nickname,
		email = :email,
		is_disabled = :is_disabled,
		is_deleted = :is_deleted
	WHERE id = :id`, user)

	return err
}

// IsEnabled is used by middleware to ensure the user is still enabled
// returns (userExist, isEnabled)
func IsEnabled(userID int) (bool, bool) {
	// nolint: gosec
	query := `SELECT is_disabled FROM ` + fmt.Sprintf("`%s`", tableName) + ` WHERE id = ? AND is_deleted = ?`
	disabled := true
	db := database.GetInstance()
	err := db.QueryRowx(query, userID, 0).Scan(&disabled)

	if err == sql.ErrNoRows {
		return false, false
	} else if err != nil {
		logger.Error("QueryError", err)
	}

	return true, !disabled
}

// List will return a list of users
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

	/*
		filters = append(filters, model.Filter{
			Field:    "is_system",
			Modifier: "equals",
			Value:    []string{"0"},
		})
	*/

	// Get count of items in this search
	query, params := entity.ListQueryBuilder(exampleModel, tableName, &pageInfo, defaultSort, filters, getFilterMapFunctions(), true)
	countRow := db.QueryRowx(query, params...)
	var totalRows int
	queryErr := countRow.Scan(&totalRows)
	if queryErr != nil && queryErr != sql.ErrNoRows {
		logger.Debug("Query: %s -- %+v", query, params)
		return result, queryErr
	}

	// Get rows
	items := make([]Model, 0)
	query, params = entity.ListQueryBuilder(exampleModel, tableName, &pageInfo, defaultSort, filters, getFilterMapFunctions(), false)
	err := db.Select(&items, query, params...)
	if err != nil {
		logger.Debug("Query: %s -- %+v", query, params)
		return result, err
	}

	for idx := range items {
		items[idx].generateGravatar()
	}

	if expand != nil {
		for idx := range items {
			expandErr := items[idx].Expand(expand)
			if expandErr != nil {
				logger.Error("UsersExpansionError", expandErr)
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

// DeleteAll will do just that, and should only be used for testing purposes.
func DeleteAll() error {
	db := database.GetInstance()
	_, err := db.Exec(fmt.Sprintf("DELETE FROM `%s`", tableName))
	return err
}

// GetCapabilities gets capabilities for a user
func GetCapabilities(userID int) ([]string, error) {
	var capabilities []string
	db := database.GetInstance()
	if db == nil {
		return []string{}, errors.ErrDatabaseUnavailable
	}

	query := `SELECT c.name FROM "user_has_capability" h
		INNER JOIN "capability" c ON c.id = h.capability_id
		WHERE h.user_id = ?`

	rows, err := db.Query(query, userID)
	if err != nil && err != sql.ErrNoRows {
		logger.Debug("QUERY: %v -- %v", query, userID)
		return []string{}, err
	}

	// nolint: errcheck
	defer rows.Close()

	for rows.Next() {
		var name string
		err := rows.Scan(&name)
		if err != nil {
			return []string{}, err
		}

		capabilities = append(capabilities, name)
	}

	return capabilities, nil
}
