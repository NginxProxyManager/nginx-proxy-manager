package handler

import (
	"encoding/json"
	"fmt"
	"net/http"

	c "npm/internal/api/context"
	h "npm/internal/api/http"
	"npm/internal/api/middleware"
	"npm/internal/entity/stream"
)

// GetStreams will return a list of Streams
// Route: GET /hosts/streams
func GetStreams() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		pageInfo, err := getPageInfoFromRequest(r)
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		hosts, err := stream.List(pageInfo, middleware.GetFiltersFromContext(r))
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
		} else {
			h.ResultResponseJSON(w, r, http.StatusOK, hosts)
		}
	}
}

// GetStream will return a single Streams
// Route: GET /hosts/streams/{hostID}
func GetStream() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		var err error
		var hostID int
		if hostID, err = getURLParamInt(r, "hostID"); err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		host, err := stream.GetByID(hostID)
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
		} else {
			h.ResultResponseJSON(w, r, http.StatusOK, host)
		}
	}
}

// CreateStream will create a Stream
// Route: POST /hosts/steams
func CreateStream() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		bodyBytes, _ := r.Context().Value(c.BodyCtxKey).([]byte)

		var newHost stream.Model
		err := json.Unmarshal(bodyBytes, &newHost)
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, h.ErrInvalidPayload.Error(), nil)
			return
		}

		// Get userID from token
		userID, _ := r.Context().Value(c.UserIDCtxKey).(int)
		newHost.UserID = userID

		if err = newHost.Save(); err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, fmt.Sprintf("Unable to save Stream: %s", err.Error()), nil)
			return
		}

		h.ResultResponseJSON(w, r, http.StatusOK, newHost)
	}
}

// UpdateStream ...
// Route: PUT /hosts/streams/{hostID}
func UpdateStream() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		var err error
		var hostID int
		if hostID, err = getURLParamInt(r, "hostID"); err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		host, err := stream.GetByID(hostID)
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
		} else {
			bodyBytes, _ := r.Context().Value(c.BodyCtxKey).([]byte)
			err := json.Unmarshal(bodyBytes, &host)
			if err != nil {
				h.ResultErrorJSON(w, r, http.StatusBadRequest, h.ErrInvalidPayload.Error(), nil)
				return
			}

			if err = host.Save(); err != nil {
				h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
				return
			}

			h.ResultResponseJSON(w, r, http.StatusOK, host)
		}
	}
}

// DeleteStream ...
// Route: DELETE /hosts/streams/{hostID}
func DeleteStream() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		var err error
		var hostID int
		if hostID, err = getURLParamInt(r, "hostID"); err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		host, err := stream.GetByID(hostID)
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
		} else {
			h.ResultResponseJSON(w, r, http.StatusOK, host.Delete())
		}
	}
}
