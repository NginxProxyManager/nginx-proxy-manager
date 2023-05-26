package handler

import (
	"database/sql"
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
		var hostID uint
		if hostID, err = getURLParamInt(r, "hostID"); err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		item, err := stream.GetByID(hostID)
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

// UpdateStream updates a stream
// Route: PUT /hosts/streams/{hostID}
func UpdateStream() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		var err error
		var hostID uint
		if hostID, err = getURLParamInt(r, "hostID"); err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		host, err := stream.GetByID(hostID)
		switch err {
		case sql.ErrNoRows:
			h.NotFound(w, r)
		case nil:
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
		default:
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
		}
	}
}

// DeleteStream removes a stream
// Route: DELETE /hosts/streams/{hostID}
func DeleteStream() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		var err error
		var hostID uint
		if hostID, err = getURLParamInt(r, "hostID"); err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		item, err := stream.GetByID(hostID)
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
