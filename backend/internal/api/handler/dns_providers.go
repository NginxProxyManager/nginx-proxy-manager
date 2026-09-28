package handler

import (
	"net/http"

	h "npm/internal/api/http"
	"npm/internal/dnsproviders"
	"npm/internal/entity/dnsprovider"
	"npm/internal/errors"
)

// GetDNSProviders will return a list of DNS Providers
// Route: GET /dns-providers
func GetDNSProviders() func(http.ResponseWriter, *http.Request) {
	return listHandler(dnsprovider.List)
}

// GetDNSProvider will return a single DNS Provider
// Route: GET /dns-providers/{providerID}
func GetDNSProvider() func(http.ResponseWriter, *http.Request) {
	return getByIDHandler("providerID", dnsprovider.GetByID)
}

// CreateDNSProvider will create a DNS Provider
// Route: POST /dns-providers
func CreateDNSProvider() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		createUserOwned(w, r, &dnsprovider.Model{}, "DNS Provider")
	}
}

// UpdateDNSProvider updates a provider
// Route: PUT /dns-providers/{providerID}
func UpdateDNSProvider() func(http.ResponseWriter, *http.Request) {
	return updateByIDHandler("providerID", dnsprovider.GetByID, (*dnsprovider.Model).Save)
}

// DeleteDNSProvider removes a provider
// Route: DELETE /dns-providers/{providerID}
func DeleteDNSProvider() func(http.ResponseWriter, *http.Request) {
	return deleteByIDHandler("providerID", dnsprovider.GetByID, (*dnsprovider.Model).Delete)
}

// GetAcmeshProviders will return a list of acme.sh providers
// Route: GET /dns-providers/acmesh
func GetAcmeshProviders() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		h.ResultResponseJSON(w, r, http.StatusOK, dnsproviders.List())
	}
}

// GetAcmeshProvider will return a single acme.sh provider
// Route: GET /dns-providers/acmesh/{acmeshID}
func GetAcmeshProvider() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		var acmeshID string
		var err error
		if acmeshID, err = getURLParamString(r, "acmeshID"); err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		item, getErr := dnsproviders.Get(acmeshID)
		switch getErr {
		case errors.ErrProviderNotFound:
			h.NotFound(w, r)
		case nil:
			h.ResultResponseJSON(w, r, http.StatusOK, item)
		default:
			h.ResultErrorJSON(w, r, http.StatusBadRequest, getErr.Error(), nil)
		}
	}
}
