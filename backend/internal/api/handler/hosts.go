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
	"npm/internal/jobqueue"
	"npm/internal/logger"
	"npm/internal/nginx"
	"npm/internal/validator"
)

// GetHosts will return a list of Hosts
// Route: GET /hosts
func GetHosts() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		pageInfo, err := getPageInfoFromRequest(r)
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		hosts, err := host.List(pageInfo, middleware.GetFiltersFromContext(r), getExpandFromContext(r))
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
		} else {
			h.ResultResponseJSON(w, r, http.StatusOK, hosts)
		}
	}
}

// GetHost will return a single Host
// Route: GET /hosts/{hostID}
func GetHost() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		var err error
		var hostID uint
		if hostID, err = getURLParamInt(r, "hostID"); err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		item, err := host.GetByID(hostID)
		switch err {
		case sql.ErrNoRows:
			h.NotFound(w, r)
		case nil:
			// nolint: errcheck,gosec
			item.Expand(getExpandFromContext(r))
			h.ResultResponseJSON(w, r, http.StatusOK, item)
		default:
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
		}
	}
}

// CreateHost will create a Host
// Route: POST /hosts
func CreateHost() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		bodyBytes, _ := r.Context().Value(c.BodyCtxKey).([]byte)

		var newHost host.Model
		err := json.Unmarshal(bodyBytes, &newHost)
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, h.ErrInvalidPayload.Error(), nil)
			return
		}

		// Get userID from token
		userID, _ := r.Context().Value(c.UserIDCtxKey).(uint)
		newHost.UserID = userID

		if err = validator.ValidateHost(newHost); err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		if err = newHost.Save(false); err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, fmt.Sprintf("Unable to save Host: %s", err.Error()), nil)
			return
		}

		if newHost.UpstreamID > 0 {
			// nolint: errcheck, gosec
			newHost.Expand([]string{"upstream"})
		}

		configureHost(newHost)

		h.ResultResponseJSON(w, r, http.StatusOK, newHost)
	}
}

// UpdateHost updates a host
// Route: PUT /hosts/{hostID}
func UpdateHost() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		var err error
		var hostID uint
		if hostID, err = getURLParamInt(r, "hostID"); err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		hostObject, err := host.GetByID(hostID)
		switch err {
		case sql.ErrNoRows:
			h.NotFound(w, r)
		case nil:
			bodyBytes, _ := r.Context().Value(c.BodyCtxKey).([]byte)
			err := json.Unmarshal(bodyBytes, &hostObject)
			if err != nil {
				h.ResultErrorJSON(w, r, http.StatusBadRequest, h.ErrInvalidPayload.Error(), nil)
				return
			}

			if err = validator.ValidateHost(hostObject); err != nil {
				h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
				return
			}

			if err = hostObject.Save(false); err != nil {
				h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
				return
			}

			// nolint: errcheck,gosec
			hostObject.Expand(getExpandFromContext(r))

			configureHost(hostObject)

			h.ResultResponseJSON(w, r, http.StatusOK, hostObject)
		default:
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
		}
	}
}

// DeleteHost removes a host
// Route: DELETE /hosts/{hostID}
func DeleteHost() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		var err error
		var hostID uint
		if hostID, err = getURLParamInt(r, "hostID"); err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		item, err := host.GetByID(hostID)
		switch err {
		case sql.ErrNoRows:
			h.NotFound(w, r)
		case nil:
			h.ResultResponseJSON(w, r, http.StatusOK, item.Delete())
			configureHost(item)
		default:
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
		}
	}
}

// GetHostNginxConfig will return a Host's nginx config from disk
// Route: GET /hosts/{hostID}/nginx-config
// Route: GET /hosts/{hostID}/nginx-config.txt
func GetHostNginxConfig(format string) func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		var err error
		var hostID uint
		if hostID, err = getURLParamInt(r, "hostID"); err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		item, err := host.GetByID(hostID)
		switch err {
		case sql.ErrNoRows:
			h.NotFound(w, r)
		case nil:
			// Get the config from disk
			content, nErr := nginx.GetHostConfigContent(item)
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

func configureHost(h host.Model) {
	err := jobqueue.AddJob(jobqueue.Job{
		Name: "NginxConfigureHost",
		Action: func() error {
			return nginx.ConfigureHost(h)
		},
	})
	if err != nil {
		logger.Error("ConfigureHostError", err)
	}
}
