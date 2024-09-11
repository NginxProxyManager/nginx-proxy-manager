package handler

import (
	"encoding/json"
	"fmt"
	"net/http"

	c "npm/internal/api/context"
	h "npm/internal/api/http"
	"npm/internal/api/middleware"
	"npm/internal/api/schema"
	"npm/internal/entity/certificate"
	"npm/internal/entity/host"
	"npm/internal/jobqueue"
	"npm/internal/logger"

	"gorm.io/gorm"
)

// GetCertificates will return a list of Certificates
// Route: GET /certificates
func GetCertificates() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		pageInfo, err := getPageInfoFromRequest(r)
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		certificates, err := certificate.List(pageInfo, middleware.GetFiltersFromContext(r), middleware.GetExpandFromContext(r))
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
		} else {
			h.ResultResponseJSON(w, r, http.StatusOK, certificates)
		}
	}
}

// GetCertificate will return a single Certificate
// Route: GET /certificates/{certificateID}
func GetCertificate() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		if item := getCertificateFromRequest(w, r); item != nil {
			// nolint: errcheck,gosec
			item.Expand(middleware.GetExpandFromContext(r))
			h.ResultResponseJSON(w, r, http.StatusOK, item)
		}
	}
}

// CreateCertificate will create a Certificate
// Route: POST /certificates
func CreateCertificate() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		var item certificate.Model
		if fillObjectFromBody(w, r, "", &item) {
			// Get userID from token
			userID, _ := r.Context().Value(c.UserIDCtxKey).(uint)
			item.UserID = userID

			if err := item.Save(); err != nil {
				h.ResultErrorJSON(w, r, http.StatusBadRequest, fmt.Sprintf("Unable to save Certificate: %s", err.Error()), nil)
				return
			}

			configureCertificate(item)
			h.ResultResponseJSON(w, r, http.StatusOK, item)
		}
	}
}

// UpdateCertificate updates a cert
// Route: PUT /certificates/{certificateID}
func UpdateCertificate() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		if item := getCertificateFromRequest(w, r); item != nil {
			// This is a special endpoint, as it needs to verify the schema payload
			// based on the certificate type, without being given a type in the payload.
			// The middleware would normally handle this.
			if fillObjectFromBody(w, r, schema.UpdateCertificate(item.Type), item) {
				if err := item.Save(); err != nil {
					h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
					return
				}

				// configureCertificate(*item, item.Request)
				h.ResultResponseJSON(w, r, http.StatusOK, item)
			}
		}
	}
}

// DeleteCertificate deletes a cert
// Route: DELETE /certificates/{certificateID}
func DeleteCertificate() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		if item := getCertificateFromRequest(w, r); item != nil {
			cnt := host.GetCertificateUseCount(item.ID)
			if cnt > 0 {
				h.ResultErrorJSON(w, r, http.StatusBadRequest, "Cannot delete certificate that is in use by at least 1 host", nil)
				return
			}
			h.ResultResponseJSON(w, r, http.StatusOK, item.Delete())
		}
	}
}

// RenewCertificate is self explanatory
// Route: PUT /certificates/{certificateID}/renew
func RenewCertificate() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		if item := getCertificateFromRequest(w, r); item != nil {
			configureCertificate(*item)
			h.ResultResponseJSON(w, r, http.StatusOK, true)
		}
	}
}

// DownloadCertificate is self explanatory
// Route: PUT /certificates/{certificateID}/download
func DownloadCertificate() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		if item := getCertificateFromRequest(w, r); item != nil {
			// todo
			h.ResultResponseJSON(w, r, http.StatusOK, "ok")
		}
	}
}

// getCertificateFromRequest has some reusable code for all endpoints that
// have a certificate id in the url. it will write errors to the output.
func getCertificateFromRequest(w http.ResponseWriter, r *http.Request) *certificate.Model {
	var err error
	var certificateID uint
	if certificateID, err = getURLParamInt(r, "certificateID"); err != nil {
		h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
		return nil
	}

	certificateObject, err := certificate.GetByID(certificateID)
	switch err {
	case gorm.ErrRecordNotFound:
		h.NotFound(w, r)
	case nil:
		return &certificateObject
	default:
		h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
	}
	return nil
}

// fillObjectFromBody has some reusable code for all endpoints that
// have a certificate id in the url. it will write errors to the output.
func fillObjectFromBody(w http.ResponseWriter, r *http.Request, validationSchema string, o interface{}) bool {
	bodyBytes, _ := r.Context().Value(c.BodyCtxKey).([]byte)

	if validationSchema != "" {
		schemaErrors, jsonErr := middleware.CheckRequestSchema(r.Context(), validationSchema, bodyBytes)
		if jsonErr != nil {
			h.ResultErrorJSON(w, r, http.StatusInternalServerError, fmt.Sprintf("Schema Fatal: %v", jsonErr), nil)
			return false
		}
		if len(schemaErrors) > 0 {
			h.ResultSchemaErrorJSON(w, r, schemaErrors)
			return false
		}
	}

	err := json.Unmarshal(bodyBytes, o)
	if err != nil {
		logger.Debug("Unmarshal Error: %+v", err)
		h.ResultErrorJSON(w, r, http.StatusBadRequest, h.ErrInvalidPayload.Error(), nil)
		return false
	}

	return true
}

func configureCertificate(c certificate.Model) {
	err := jobqueue.AddJob(jobqueue.Job{
		Name:   "RequestCertificate",
		Action: c.Request,
	})
	if err != nil {
		logger.Error("ConfigureCertificateError", err)
	}
}
