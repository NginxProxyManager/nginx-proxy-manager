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
	"npm/internal/jobqueue"
	"npm/internal/logger"
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

		certificates, err := certificate.List(pageInfo, middleware.GetFiltersFromContext(r))
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
		var err error
		var certificateID int
		if certificateID, err = getURLParamInt(r, "certificateID"); err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		cert, err := certificate.GetByID(certificateID)
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
		} else {
			h.ResultResponseJSON(w, r, http.StatusOK, cert)
		}
	}
}

// CreateCertificate will create a Certificate
// Route: POST /certificates
func CreateCertificate() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		bodyBytes, _ := r.Context().Value(c.BodyCtxKey).([]byte)

		var newCertificate certificate.Model
		err := json.Unmarshal(bodyBytes, &newCertificate)
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, h.ErrInvalidPayload.Error(), nil)
			return
		}

		// Get userID from token
		userID, _ := r.Context().Value(c.UserIDCtxKey).(int)
		newCertificate.UserID = userID

		if err = newCertificate.Save(); err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, fmt.Sprintf("Unable to save Certificate: %s", err.Error()), nil)
			return
		}

		configureCertificate(newCertificate)

		h.ResultResponseJSON(w, r, http.StatusOK, newCertificate)
	}
}

// UpdateCertificate updates a cert
// Route: PUT /certificates/{certificateID}
func UpdateCertificate() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		var err error
		var certificateID int
		if certificateID, err = getURLParamInt(r, "certificateID"); err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		certificateObject, err := certificate.GetByID(certificateID)
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
		} else {

			// This is a special endpoint, as it needs to verify the schema payload
			// based on the certificate type, without being given a type in the payload.
			// The middleware would normally handle this.
			bodyBytes, _ := r.Context().Value(c.BodyCtxKey).([]byte)
			schemaErrors, jsonErr := middleware.CheckRequestSchema(r.Context(), schema.UpdateCertificate(certificateObject.Type), bodyBytes)
			if jsonErr != nil {
				h.ResultErrorJSON(w, r, http.StatusInternalServerError, fmt.Sprintf("Schema Fatal: %v", jsonErr), nil)
				return
			}

			if len(schemaErrors) > 0 {
				h.ResultSchemaErrorJSON(w, r, schemaErrors)
				return
			}

			err := json.Unmarshal(bodyBytes, &certificateObject)
			if err != nil {
				h.ResultErrorJSON(w, r, http.StatusBadRequest, h.ErrInvalidPayload.Error(), nil)
				return
			}

			if err = certificateObject.Save(); err != nil {
				h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
				return
			}

			configureCertificate(certificateObject)

			h.ResultResponseJSON(w, r, http.StatusOK, certificateObject)
		}
	}
}

// DeleteCertificate deletes a cert
// Route: DELETE /certificates/{certificateID}
func DeleteCertificate() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		var err error
		var certificateID int
		if certificateID, err = getURLParamInt(r, "certificateID"); err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		cert, err := certificate.GetByID(certificateID)
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
		} else {
			h.ResultResponseJSON(w, r, http.StatusOK, cert.Delete())
		}
	}
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
