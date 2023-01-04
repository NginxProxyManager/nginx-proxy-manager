package handler

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"

	c "npm/internal/api/context"
	h "npm/internal/api/http"
	"npm/internal/api/middleware"
	"npm/internal/entity/upstream"
	"npm/internal/jobqueue"
	"npm/internal/logger"
	"npm/internal/nginx"
	"npm/internal/validator"
)

// GetUpstreams will return a list of Upstreams
// Route: GET /upstreams
func GetUpstreams() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		pageInfo, err := getPageInfoFromRequest(r)
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		items, err := upstream.List(pageInfo, middleware.GetFiltersFromContext(r), getExpandFromContext(r))
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
		} else {
			h.ResultResponseJSON(w, r, http.StatusOK, items)
		}
	}
}

// GetUpstream will return a single Upstream
// Route: GET /upstreams/{upstreamID}
func GetUpstream() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		var err error
		var upstreamID int
		if upstreamID, err = getURLParamInt(r, "upstreamID"); err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		item, err := upstream.GetByID(upstreamID)
		switch err {
		case sql.ErrNoRows:
			h.ResultErrorJSON(w, r, http.StatusNotFound, "Not found", nil)
		case nil:
			// nolint: errcheck,gosec
			item.Expand(getExpandFromContext(r))
			h.ResultResponseJSON(w, r, http.StatusOK, item)
		default:
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
		}
	}
}

// CreateUpstream will create a Upstream
// Route: POST /upstreams
func CreateUpstream() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		bodyBytes, _ := r.Context().Value(c.BodyCtxKey).([]byte)

		var newUpstream upstream.Model
		err := json.Unmarshal(bodyBytes, &newUpstream)
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, h.ErrInvalidPayload.Error(), nil)
			return
		}

		// Get userID from token
		userID, _ := r.Context().Value(c.UserIDCtxKey).(int)
		newUpstream.UserID = userID

		if err = validator.ValidateUpstream(newUpstream); err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		if err = newUpstream.Save(false); err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, fmt.Sprintf("Unable to save Upstream: %s", err.Error()), nil)
			return
		}

		configureUpstream(newUpstream)

		h.ResultResponseJSON(w, r, http.StatusOK, newUpstream)
	}
}

// DeleteUpstream removes a upstream
// Route: DELETE /upstreams/{upstreamID}
func DeleteUpstream() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		var err error
		var upstreamID int
		if upstreamID, err = getURLParamInt(r, "upstreamID"); err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		item, err := upstream.GetByID(upstreamID)
		switch err {
		case sql.ErrNoRows:
			h.ResultErrorJSON(w, r, http.StatusNotFound, "Not found", nil)
		case nil:
			h.ResultResponseJSON(w, r, http.StatusOK, item.Delete())
		default:
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
		}
	}
}

func configureUpstream(u upstream.Model) {
	err := jobqueue.AddJob(jobqueue.Job{
		Name: "NginxConfigureUpstream",
		Action: func() error {
			return nginx.ConfigureUpstream(u)
		},
	})
	if err != nil {
		logger.Error("ConfigureUpstreamError", err)
	}
}
