package setting

import (
	"npm/internal/config"
	"npm/internal/entity"
	"npm/internal/logger"
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

// List will return a list of settings
func List(pageInfo model.PageInfo, filters []model.Filter) (entity.ListResponse, error) {
	var result entity.ListResponse

	defaultSort := model.Sort{
		Field:     "name",
		Direction: "ASC",
	}

	dbo := entity.ListQueryBuilder(&pageInfo, defaultSort, filters)

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

// ApplySettings will load settings from the DB and apply them where required
func ApplySettings() {
	logger.Debug("Applying Settings")

	// Error-reporting
	m, err := GetByName("error-reporting")
	if err != nil {
		logger.Error("ApplySettingsError", err)
	} else {
		config.ErrorReporting = m.Value.String() == "true"
	}
}
