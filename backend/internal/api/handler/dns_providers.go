package handler

import (
	"encoding/json"
	"fmt"
	"net/http"

	c "npm/internal/api/context"
	h "npm/internal/api/http"
	"npm/internal/api/middleware"
	"npm/internal/entity/dnsprovider"
)

// GetDNSProviders will return a list of DNS Providers
// Route: GET /dns-providers
func GetDNSProviders() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		pageInfo, err := getPageInfoFromRequest(r)
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		items, err := dnsprovider.List(pageInfo, middleware.GetFiltersFromContext(r))
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
		} else {
			h.ResultResponseJSON(w, r, http.StatusOK, items)
		}
	}
}

// GetDNSProvider will return a single DNS Provider
// Route: GET /dns-providers/{providerID}
func GetDNSProvider() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		var err error
		var providerID int
		if providerID, err = getURLParamInt(r, "providerID"); err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		item, err := dnsprovider.GetByID(providerID)
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
		} else {
			h.ResultResponseJSON(w, r, http.StatusOK, item)
		}
	}
}

// CreateDNSProvider will create a DNS Provider
// Route: POST /dns-providers
func CreateDNSProvider() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		bodyBytes, _ := r.Context().Value(c.BodyCtxKey).([]byte)

		var newItem dnsprovider.Model
		err := json.Unmarshal(bodyBytes, &newItem)
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, h.ErrInvalidPayload.Error(), nil)
			return
		}

		// Get userID from token
		userID, _ := r.Context().Value(c.UserIDCtxKey).(int)
		newItem.UserID = userID

		if err = newItem.Save(); err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, fmt.Sprintf("Unable to save DNS Provider: %s", err.Error()), nil)
			return
		}

		h.ResultResponseJSON(w, r, http.StatusOK, newItem)
	}
}

// UpdateDNSProvider ...
// Route: PUT /dns-providers/{providerID}
func UpdateDNSProvider() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		var err error
		var providerID int
		if providerID, err = getURLParamInt(r, "providerID"); err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		item, err := dnsprovider.GetByID(providerID)
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
		} else {
			bodyBytes, _ := r.Context().Value(c.BodyCtxKey).([]byte)
			err := json.Unmarshal(bodyBytes, &item)
			if err != nil {
				h.ResultErrorJSON(w, r, http.StatusBadRequest, h.ErrInvalidPayload.Error(), nil)
				return
			}

			if err = item.Save(); err != nil {
				h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
				return
			}

			h.ResultResponseJSON(w, r, http.StatusOK, item)
		}
	}
}

// DeleteDNSProvider ...
// Route: DELETE /dns-providers/{providerID}
func DeleteDNSProvider() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		var err error
		var providerID int
		if providerID, err = getURLParamInt(r, "providerID"); err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		item, err := dnsprovider.GetByID(providerID)
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
		} else {
			h.ResultResponseJSON(w, r, http.StatusOK, item.Delete())
		}
	}
}
