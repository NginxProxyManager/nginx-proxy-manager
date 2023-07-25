package handler

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"

	c "npm/internal/api/context"
	h "npm/internal/api/http"
	"npm/internal/api/middleware"
	"npm/internal/entity/host"
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

		items, err := upstream.List(pageInfo, middleware.GetFiltersFromContext(r), middleware.GetExpandFromContext(r))
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
		var upstreamID uint
		if upstreamID, err = getURLParamInt(r, "upstreamID"); err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		item, err := upstream.GetByID(upstreamID)
		switch err {
		case sql.ErrNoRows:
			h.NotFound(w, r)
		case nil:
			// nolint: errcheck,gosec
			item.Expand(middleware.GetExpandFromContext(r))
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
		userID, _ := r.Context().Value(c.UserIDCtxKey).(uint)
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

// UpdateHost updates a host
// Route: PUT /upstreams/{upstreamID}
func UpdateUpstream() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		var err error
		var upstreamID uint
		if upstreamID, err = getURLParamInt(r, "upstreamID"); err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		item, err := upstream.GetByID(upstreamID)
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
		} else {
			bodyBytes, _ := r.Context().Value(c.BodyCtxKey).([]byte)
			err := json.Unmarshal(bodyBytes, &item)
			if err != nil {
				h.ResultErrorJSON(w, r, http.StatusBadRequest, h.ErrInvalidPayload.Error(), nil)
				return
			}

			if err = validator.ValidateUpstream(item); err != nil {
				h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
				return
			}

			if err = item.Save(false); err != nil {
				h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
				return
			}

			// nolint: errcheck,gosec
			// item.Expand(middleware.GetExpandFromContext(r))

			configureUpstream(item)

			h.ResultResponseJSON(w, r, http.StatusOK, item)
		}
	}
}

// DeleteUpstream removes a upstream
// Route: DELETE /upstreams/{upstreamID}
func DeleteUpstream() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		var err error
		var upstreamID uint
		if upstreamID, err = getURLParamInt(r, "upstreamID"); err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		item, err := upstream.GetByID(upstreamID)
		switch err {
		case sql.ErrNoRows:
			h.NotFound(w, r)
		case nil:
			// Ensure that this upstream isn't in use by a host
			cnt := host.GetUpstreamUseCount(upstreamID)
			if cnt > 0 {
				h.ResultErrorJSON(w, r, http.StatusBadRequest, "Cannot delete upstream that is in use by at least 1 host", nil)
				return
			}
			h.ResultResponseJSON(w, r, http.StatusOK, item.Delete())
			configureUpstream(item)
		default:
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
		}
	}
}

// GetHostNginxConfig will return a Host's nginx config from disk
// Route: GET /upstreams/{upstreamID}/nginx-config
// Route: GET /upstreams/{upstreamID}/nginx-config.txt
func GetUpstreamNginxConfig(format string) func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		var err error
		var upstreamID uint
		if upstreamID, err = getURLParamInt(r, "upstreamID"); err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		item, err := upstream.GetByID(upstreamID)
		switch err {
		case sql.ErrNoRows:
			h.NotFound(w, r)
		case nil:
			// Get the config from disk
			content, nErr := nginx.GetUpstreamConfigContent(item)
			if nErr != nil {
				h.ResultErrorJSON(w, r, http.StatusBadRequest, nErr.Error(), nil)
				return
			}
			if format == "text" {
				h.ResultResponseText(w, r, http.StatusOK, content)
				return
			}
			h.ResultResponseJSON(w, r, http.StatusOK, content)
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
