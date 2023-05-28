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
