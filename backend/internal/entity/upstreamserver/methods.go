package upstreamserver

import (
	"npm/internal/database"
	"npm/internal/entity"
	"npm/internal/model"
)

// GetByID finds a Upstream Server by ID
func GetByID(id int) (Model, error) {
	var m Model
	err := m.LoadByID(id)
	return m, err
}

// GetByUpstreamID finds all servers in the upstream
func GetByUpstreamID(upstreamID uint) ([]Model, error) {
	items := make([]Model, 0)
	db := database.GetDB()
	result := db.Where("upstream_id = ?", upstreamID).Order("server ASC").Find(&items)
	return items, result.Error
}

// List will return a list of Upstreams
func List(pageInfo model.PageInfo, filters []model.Filter) (entity.ListResponse, error) {
	var result entity.ListResponse

	defaultSort := model.Sort{
		Field:     "server",
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
