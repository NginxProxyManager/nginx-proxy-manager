package host

import (
	"npm/internal/database"
	"npm/internal/entity"
	"npm/internal/logger"
	"npm/internal/model"
)

// GetByID finds a Host by ID
func GetByID(id uint) (Model, error) {
	var m Model
	err := m.LoadByID(id)
	return m, err
}

// List will return a list of hosts
func List(pageInfo model.PageInfo, filters []model.Filter, expand []string) (entity.ListResponse, error) {
	var result entity.ListResponse

	defaultSort := model.Sort{
		Field:     "domain_names",
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

	if expand != nil {
		for idx := range items {
			expandErr := items[idx].Expand(expand)
			if expandErr != nil {
				logger.Error("HostsExpansionError", expandErr)
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

// GetUpstreamUseCount returns the number of hosts that are using
// an upstream, and have not been deleted.
func GetUpstreamUseCount(upstreamID uint) int64 {
	db := database.GetDB()

	var count int64
	if result := db.Model(&Model{}).Where("upstream_id = ?", upstreamID).Count(&count); result.Error != nil {
		logger.Debug("GetUpstreamUseCount Error: %v", result.Error)
		return 0
	}
	return count
}

// GetCertificateUseCount returns the number of hosts that are using
// a certificate, and have not been deleted.
func GetCertificateUseCount(certificateID uint) int64 {
	db := database.GetDB()

	var count int64
	if result := db.Model(&Model{}).Where("certificate_id = ?", certificateID).Count(&count); result.Error != nil {
		logger.Debug("GetUpstreamUseCount Error: %v", result.Error)
		return 0
	}
	return count
}

// AddPendingJobs is intended to be used at startup to add
// anything pending to the JobQueue just once, based on
// the database row status
func AddPendingJobs() {
	// todo
}
