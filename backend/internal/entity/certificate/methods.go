package certificate

import (
	"npm/internal/database"
	"npm/internal/entity"
	"npm/internal/jobqueue"
	"npm/internal/logger"
	"npm/internal/model"
)

// GetByID finds a row by ID
func GetByID(id uint) (Model, error) {
	var m Model
	err := m.LoadByID(id)
	return m, err
}

// GetByStatus will select rows that are ready for requesting
func GetByStatus(status string) ([]Model, error) {
	items := make([]Model, 0)
	db := database.GetDB()
	result := db.
		Joins("INNER JOIN certificate_authority ON certificate_authority.id = certificate.certificate_authority_id AND certificate_authority.is_deleted = ?", 0).
		Where("type IN ?", []string{"http", "dns"}).
		Where("status = ?", status).
		Where("certificate_authority_id > ?", 0).
		Find(&items)
	return items, result.Error
}

// List will return a list of certificates
func List(pageInfo model.PageInfo, filters []model.Filter, expand []string) (entity.ListResponse, error) {
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

	if expand != nil {
		for idx := range items {
			expandErr := items[idx].Expand(expand)
			if expandErr != nil {
				logger.Error("CertificatesExpansionError", expandErr)
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

// AddPendingJobs is intended to be used at startup to add
// anything pending to the JobQueue just once, based on
// the database row status
func AddPendingJobs() {
	rows, err := GetByStatus(StatusReady)
	if err != nil {
		logger.Error("AddPendingJobsError", err)
		return
	}

	for _, row := range rows {
		logger.Debug("Adding RequestCertificate job: %+v", row)
		err := jobqueue.AddJob(jobqueue.Job{
			Name:   "RequestCertificate",
			Action: row.Request,
		})
		if err != nil {
			logger.Error("AddPendingJobsError", err)
		}
	}
}
