package handler

import (
	"encoding/json"
	"fmt"
	"net/http"

	c "npm/internal/api/context"
	h "npm/internal/api/http"
	"npm/internal/api/middleware"
	"npm/internal/entity/certificateauthority"
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
		var caID int
		if caID, err = getURLParamInt(r, "caID"); err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		cert, err := certificateauthority.GetByID(caID)
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
		} else {
			h.ResultResponseJSON(w, r, http.StatusOK, cert)
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

		if err = newCA.Save(); err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, fmt.Sprintf("Unable to save Certificate Authority: %s", err.Error()), nil)
			return
		}

		h.ResultResponseJSON(w, r, http.StatusOK, newCA)
	}
}

// UpdateCertificateAuthority updates a ca
// Route: PUT /certificate-authorities/{caID}
func UpdateCertificateAuthority() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		var err error
		var caID int
		if caID, err = getURLParamInt(r, "caID"); err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		ca, err := certificateauthority.GetByID(caID)
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
		} else {

			bodyBytes, _ := r.Context().Value(c.BodyCtxKey).([]byte)
			err := json.Unmarshal(bodyBytes, &ca)
			if err != nil {
				h.ResultErrorJSON(w, r, http.StatusBadRequest, h.ErrInvalidPayload.Error(), nil)
				return
			}

			if err = ca.Save(); err != nil {
				h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
				return
			}

			h.ResultResponseJSON(w, r, http.StatusOK, ca)
		}
	}
}

// DeleteCertificateAuthority deletes a ca
// Route: DELETE /certificate-authorities/{caID}
func DeleteCertificateAuthority() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		var err error
		var caID int
		if caID, err = getURLParamInt(r, "caID"); err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		cert, err := certificateauthority.GetByID(caID)
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
		} else {
			h.ResultResponseJSON(w, r, http.StatusOK, cert.Delete())
		}
	}
}
