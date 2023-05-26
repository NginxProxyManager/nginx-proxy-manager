package auth

import (
	"npm/internal/database"
)

// GetByID finds a auth by ID
func GetByID(id int) (Model, error) {
	var m Model
	err := m.LoadByID(id)
	return m, err
}

// GetByUserIDType finds a user by email
func GetByUserIDType(userID uint, authType string) (Model, error) {
	var auth Model
	db := database.GetDB()
	result := db.
		Where("user_id = ?", userID).
		Where("type = ?", authType).
		First(&auth)
	return auth, result.Error
}

/*
// Create will create a Auth from this model
func Create(auth *Model) (int, error) {
	if auth.ID != 0 {
		return 0, eris.New("Cannot create auth when model already has an ID")
	}

	auth.Touch(true)

	db := database.GetInstance()
	// nolint: gosec
	result, err := db.NamedExec(`INSERT INTO `+fmt.Sprintf("`%s`", tableName)+` (
		created_on,
		modified_on,
		user_id,
		type,
		secret,
		is_deleted
	) VALUES (
		:created_on,
		:modified_on,
		:user_id,
		:type,
		:secret,
		:is_deleted
	)`, auth)

	if err != nil {
		return 0, err
	}

	last, lastErr := result.LastInsertId()
	if lastErr != nil {
		return 0, lastErr
	}

	return int(last), nil
}
*/

/*
// Update will Update a Auth from this model
func Update(auth *Model) error {
	if auth.ID == 0 {
		return eris.New("Cannot update auth when model doesn't have an ID")
	}

	auth.Touch(false)

	db := database.GetInstance()
	// nolint: gosec
	_, err := db.NamedExec(`UPDATE `+fmt.Sprintf("`%s`", tableName)+` SET
		created_on = :created_on,
		modified_on = :modified_on,
		user_id = :user_id,
		type = :type,
		secret = :secret,
		is_deleted = :is_deleted
	WHERE id = :id`, auth)

	return err
}
*/
