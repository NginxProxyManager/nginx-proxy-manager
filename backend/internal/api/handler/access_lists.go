package handler

import (
	"encoding/json"
	"fmt"
	"net/http"

	c "npm/internal/api/context"
	h "npm/internal/api/http"
	"npm/internal/api/middleware"
	"npm/internal/entity/accesslist"
)

// GetAccessLists will return a list of Access Lists
// Route: GET /access-lists
func GetAccessLists() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		pageInfo, err := getPageInfoFromRequest(r)
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		items, err := accesslist.List(pageInfo, middleware.GetFiltersFromContext(r))
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
		} else {
			h.ResultResponseJSON(w, r, http.StatusOK, items)
		}
	}
}

// GetAccessList will return a single access list
// Route: GET /access-lists/{accessListID}
func GetAccessList() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		var err error
		var accessListID uint
		if accessListID, err = getURLParamInt(r, "accessListID"); err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		item, err := accesslist.GetByID(accessListID)
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
		} else {
			h.ResultResponseJSON(w, r, http.StatusOK, item)
		}
	}
}

// CreateAccessList will create an access list
// Route: POST /access-lists
func CreateAccessList() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		bodyBytes, _ := r.Context().Value(c.BodyCtxKey).([]byte)

		var newItem accesslist.Model
		err := json.Unmarshal(bodyBytes, &newItem)
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, h.ErrInvalidPayload.Error(), nil)
			return
		}

		// Get userID from token
		userID, _ := r.Context().Value(c.UserIDCtxKey).(uint)
		newItem.UserID = userID

		if err = newItem.Save(); err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, fmt.Sprintf("Unable to save Access List: %s", err.Error()), nil)
			return
		}

		h.ResultResponseJSON(w, r, http.StatusOK, newItem)
	}
}

// UpdateAccessList is self explanatory
// Route: PUT /access-lists/{accessListID}
func UpdateAccessList() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		var err error
		var accessListID uint
		if accessListID, err = getURLParamInt(r, "accessListID"); err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		item, err := accesslist.GetByID(accessListID)
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

// DeleteAccessList is self explanatory
// Route: DELETE /access-lists/{accessListID}
func DeleteAccessList() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		var err error
		var accessListID uint
		if accessListID, err = getURLParamInt(r, "accessListID"); err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		item, err := accesslist.GetByID(accessListID)
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
		} else {
			h.ResultResponseJSON(w, r, http.StatusOK, item.Delete())
		}
	}
}
