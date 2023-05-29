package user

import (
	"npm/internal/database"
	"npm/internal/entity"
	"npm/internal/logger"
	"npm/internal/model"
)

// GetByID finds a user by ID
func GetByID(id uint) (Model, error) {
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

// IsEnabled is used by middleware to ensure the user is still enabled
// returns (userExist, isEnabled)
func IsEnabled(userID uint) (bool, bool) {
	var user Model
	db := database.GetDB()
	if result := db.First(&user, userID); result.Error != nil {
		return false, false
	}
	return true, !user.IsDisabled
}

// List will return a list of users
func List(pageInfo model.PageInfo, filters []model.Filter, expand []string) (entity.ListResponse, error) {
	var result entity.ListResponse

	defaultSort := model.Sort{
		Field:     "name",
		Direction: "ASC",
	}

	dbo := entity.ListQueryBuilder(&pageInfo, defaultSort, filters, entity.GetFilterMap(Model{}, true))

	// Get count of items in this search
	var totalRows int64
	if res := dbo.Model(&Model{}).Count(&totalRows); res.Error != nil {
		return result, res.Error
	}

	// Get rows
	items := make([]Model, 0)
	if res := dbo.Find(&items); res.Error != nil {
		return result, res.Error
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

	result = entity.ListResponse{
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
	db := database.GetDB()
	result := db.Exec("DELETE FROM user")
	return result.Error
}

// GetCapabilities gets capabilities for a user
func GetCapabilities(userID uint) ([]string, error) {
	capabilities := make([]string, 0)
	var hasCapabilities []UserHasCapabilityModel
	db := database.GetDB()
	if result := db.Where("user_id = ?", userID).Find(&hasCapabilities); result.Error != nil {
		return nil, result.Error
	}
	for _, obj := range hasCapabilities {
		capabilities = append(capabilities, obj.CapabilityName)
	}
	return capabilities, nil
}
