package handler

import (
	"encoding/json"
	"fmt"
	"net/http"

	"npm/internal/acme"
	c "npm/internal/api/context"
	h "npm/internal/api/http"
	"npm/internal/api/middleware"
	"npm/internal/entity/certificateauthority"
	"npm/internal/logger"

	"gorm.io/gorm"
)

// GetCertificateAuthorities will return a list of Certificate Authorities
// Route: GET /certificate-authorities
func GetCertificateAuthorities() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		pageInfo, err := getPageInfoFromRequest(r)
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		certificates, err := certificateauthority.List(pageInfo, middleware.GetFiltersFromContext(r))
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
		} else {
			h.ResultResponseJSON(w, r, http.StatusOK, certificates)
		}
	}
}

// GetCertificateAuthority will return a single Certificate Authority
// Route: GET /certificate-authorities/{caID}
func GetCertificateAuthority() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		var err error
		var caID uint
		if caID, err = getURLParamInt(r, "caID"); err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		item, err := certificateauthority.GetByID(caID)
		switch err {
		case gorm.ErrRecordNotFound:
			h.NotFound(w, r)
		case nil:
			h.ResultResponseJSON(w, r, http.StatusOK, item)
		default:
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
		}
	}
}

// CreateCertificateAuthority will create a Certificate Authority
// Route: POST /certificate-authorities
func CreateCertificateAuthority() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		bodyBytes, _ := r.Context().Value(c.BodyCtxKey).([]byte)

		var newCA certificateauthority.Model
		err := json.Unmarshal(bodyBytes, &newCA)
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, h.ErrInvalidPayload.Error(), nil)
			return
		}

		if err = newCA.Check(); err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		if err = newCA.Save(); err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, fmt.Sprintf("Unable to save Certificate Authority: %s", err.Error()), nil)
			return
		}

		if err = acme.CreateAccountKey(&newCA); err != nil {
			logger.Error("CreateAccountKeyError", err)
		}

		h.ResultResponseJSON(w, r, http.StatusOK, newCA)
	}
}

// UpdateCertificateAuthority updates a ca
// Route: PUT /certificate-authorities/{caID}
func UpdateCertificateAuthority() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		var err error
		var caID uint
		if caID, err = getURLParamInt(r, "caID"); err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		ca, err := certificateauthority.GetByID(caID)
		switch err {
		case gorm.ErrRecordNotFound:
			h.NotFound(w, r)
		case nil:
			bodyBytes, _ := r.Context().Value(c.BodyCtxKey).([]byte)
			err := json.Unmarshal(bodyBytes, &ca)
			if err != nil {
				h.ResultErrorJSON(w, r, http.StatusBadRequest, h.ErrInvalidPayload.Error(), nil)
				return
			}

			if err = ca.Check(); err != nil {
				h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
				return
			}

			if err = ca.Save(); err != nil {
				h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
				return
			}

			h.ResultResponseJSON(w, r, http.StatusOK, ca)
		default:
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
		}
	}
}

// DeleteCertificateAuthority deletes a ca
// Route: DELETE /certificate-authorities/{caID}
func DeleteCertificateAuthority() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		var err error
		var caID uint
		if caID, err = getURLParamInt(r, "caID"); err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		item, err := certificateauthority.GetByID(caID)
		switch err {
		case gorm.ErrRecordNotFound:
			h.NotFound(w, r)
		case nil:
			h.ResultResponseJSON(w, r, http.StatusOK, item.Delete())
		default:
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
		}
	}
}
