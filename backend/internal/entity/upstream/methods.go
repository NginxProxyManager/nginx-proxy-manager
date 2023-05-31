package upstream

import (
	"npm/internal/entity"
	"npm/internal/model"
)

// GetByID finds a Upstream by ID
func GetByID(id uint) (Model, error) {
	var m Model
	err := m.LoadByID(id)
	return m, err
}

// List will return a list of Upstreams
func List(pageInfo model.PageInfo, filters []model.Filter, expand []string) (entity.ListResponse, error) {
	var result entity.ListResponse

	defaultSort := model.Sort{
		Field:     "name",
		Direction: "ASC",
	}

	dbo := entity.ListQueryBuilder(&pageInfo, filters, entity.GetFilterMap(Model{}, true))

	// Get count of items in this search
	var totalRows int64
	if res := dbo.Model(&Model{}).Count(&totalRows); res.Error != nil {
		return result, res.Error
	}

	// Get rows
	items := make([]Model, 0)
	if res := entity.AddOrderToList(dbo, &pageInfo, defaultSort).Find(&items); res.Error != nil {
		return result, res.Error
	}

	// Expand to get servers, at a minimum
	for idx := range items {
		// nolint: errcheck, gosec
		items[idx].Expand(expand)
	}

	result = entity.ListResponse{
		Items:  items,
		Total:  totalRows,
		Limit:  pageInfo.Limit,
		Offset: pageInfo.Offset,
		Sort:   pageInfo.GetSort(defaultSort),
		Filter: filters,
	}

	return result, nil
}
