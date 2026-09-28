//nolint:dupl // thin wiring of the shared CRUD helpers in crud.go
package handler

import (
	"net/http"

	"npm/internal/entity/nginxtemplate"
)

// GetNginxTemplates will return a list of Nginx Templates
// Route: GET /nginx-templates
func GetNginxTemplates() func(http.ResponseWriter, *http.Request) {
	return listHandler(nginxtemplate.List)
}

// GetNginxTemplate will return a single Nginx Template
// Route: GET /nginx-templates/{templateID}
func GetNginxTemplate() func(http.ResponseWriter, *http.Request) {
	return getByIDHandler("templateID", nginxtemplate.GetByID)
}

// CreateNginxTemplate will create a Nginx Template
// Route: POST /nginx-templates
func CreateNginxTemplate() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		createUserOwned(w, r, &nginxtemplate.Model{}, "Nginx Template")
	}
}

// UpdateNginxTemplate updates a nginx template
// Route: PUT /nginx-templates/{templateID}
func UpdateNginxTemplate() func(http.ResponseWriter, *http.Request) {
	return updateByIDHandler("templateID", nginxtemplate.GetByID, (*nginxtemplate.Model).Save)
}

// DeleteNginxTemplate removes a nginx template
// Route: DELETE /nginx-templates/{templateID}
func DeleteNginxTemplate() func(http.ResponseWriter, *http.Request) {
	return deleteByIDHandler("templateID", nginxtemplate.GetByID, (*nginxtemplate.Model).Delete)
}
