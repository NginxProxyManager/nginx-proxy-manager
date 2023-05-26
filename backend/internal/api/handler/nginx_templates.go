package handler

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"

	c "npm/internal/api/context"
	h "npm/internal/api/http"
	"npm/internal/api/middleware"
	"npm/internal/entity/nginxtemplate"
)

// GetNginxTemplates will return a list of Nginx Templates
// Route: GET /nginx-templates
func GetNginxTemplates() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		pageInfo, err := getPageInfoFromRequest(r)
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		items, err := nginxtemplate.List(pageInfo, middleware.GetFiltersFromContext(r))
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
		} else {
			h.ResultResponseJSON(w, r, http.StatusOK, items)
		}
	}
}

// GetNginxTemplate will return a single Nginx Template
// Route: GET /nginx-templates/{templateID}
func GetNginxTemplate() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		var err error
		var templateID uint
		if templateID, err = getURLParamInt(r, "templateID"); err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		item, err := nginxtemplate.GetByID(templateID)
		switch err {
		case sql.ErrNoRows:
			h.NotFound(w, r)
		case nil:
			h.ResultResponseJSON(w, r, http.StatusOK, item)
		default:
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
		}
	}
}

// CreateNginxTemplate will create a Nginx Template
// Route: POST /nginx-templates
func CreateNginxTemplate() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		bodyBytes, _ := r.Context().Value(c.BodyCtxKey).([]byte)

		var newNginxTemplate nginxtemplate.Model
		err := json.Unmarshal(bodyBytes, &newNginxTemplate)
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, h.ErrInvalidPayload.Error(), nil)
			return
		}

		// Get userID from token
		userID, _ := r.Context().Value(c.UserIDCtxKey).(int)
		newNginxTemplate.UserID = userID

		if err = newNginxTemplate.Save(); err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, fmt.Sprintf("Unable to save Nginx Template: %s", err.Error()), nil)
			return
		}

		h.ResultResponseJSON(w, r, http.StatusOK, newNginxTemplate)
	}
}

// UpdateNginxTemplate updates a nginx template
// Route: PUT /nginx-templates/{templateID}
func UpdateNginxTemplate() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		var err error
		var templateID uint
		if templateID, err = getURLParamInt(r, "templateID"); err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		// reconfigure, _ := getQueryVarBool(r, "reconfigure", false, false)

		nginxTemplate, err := nginxtemplate.GetByID(templateID)
		switch err {
		case sql.ErrNoRows:
			h.NotFound(w, r)
		case nil:
			bodyBytes, _ := r.Context().Value(c.BodyCtxKey).([]byte)
			err := json.Unmarshal(bodyBytes, &nginxTemplate)
			if err != nil {
				h.ResultErrorJSON(w, r, http.StatusBadRequest, h.ErrInvalidPayload.Error(), nil)
				return
			}

			if err = nginxTemplate.Save(); err != nil {
				h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
				return
			}

			h.ResultResponseJSON(w, r, http.StatusOK, nginxTemplate)
		default:
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
		}
	}
}

// DeleteNginxTemplate removes a nginx template
// Route: DELETE /nginx-templates/{templateID}
func DeleteNginxTemplate() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		var err error
		var templateID uint
		if templateID, err = getURLParamInt(r, "templateID"); err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		item, err := nginxtemplate.GetByID(templateID)
		switch err {
		case sql.ErrNoRows:
			h.NotFound(w, r)
		case nil:
			h.ResultResponseJSON(w, r, http.StatusOK, item.Delete())
		default:
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
		}
	}
}
