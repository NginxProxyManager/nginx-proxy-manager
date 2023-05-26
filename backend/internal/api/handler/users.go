package handler

import (
	"database/sql"
	"encoding/json"
	"net/http"

	c "npm/internal/api/context"
	h "npm/internal/api/http"
	"npm/internal/api/middleware"
	"npm/internal/config"
	"npm/internal/entity/auth"
	"npm/internal/entity/user"
	"npm/internal/errors"
	"npm/internal/logger"

	"github.com/go-chi/chi/v5"
)

// GetUsers returns all users
// Route: GET /users
func GetUsers() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		pageInfo, err := getPageInfoFromRequest(r)
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		users, err := user.List(pageInfo, middleware.GetFiltersFromContext(r), getExpandFromContext(r))
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
		} else {
			h.ResultResponseJSON(w, r, http.StatusOK, users)
		}
	}
}

// GetUser returns a specific user
// Route: GET /users/{userID}
func GetUser() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _, userIDErr := getUserIDFromRequest(r)
		if userIDErr != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, userIDErr.Error(), nil)
			return
		}

		item, err := user.GetByID(userID)
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

// UpdateUser updates a user
// Route: PUT /users/{userID}
func UpdateUser() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, self, userIDErr := getUserIDFromRequest(r)
		if userIDErr != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, userIDErr.Error(), nil)
			return
		}

		userObject, err := user.GetByID(userID)
		switch err {
		case sql.ErrNoRows:
			h.NotFound(w, r)
		case nil:
			// nolint: errcheck,gosec
			userObject.Expand([]string{"capabilities"})
			bodyBytes, _ := r.Context().Value(c.BodyCtxKey).([]byte)
			err := json.Unmarshal(bodyBytes, &userObject)
			if err != nil {
				h.ResultErrorJSON(w, r, http.StatusBadRequest, h.ErrInvalidPayload.Error(), nil)
				return
			}

			if userObject.IsDisabled && self {
				h.ResultErrorJSON(w, r, http.StatusBadRequest, "You cannot disable yourself!", nil)
				return
			}

			if err = userObject.Save(); err != nil {
				if err == errors.ErrDuplicateEmailUser || err == errors.ErrSystemUserReadonly {
					h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
				} else {
					logger.Error("UpdateUserError", err)
					h.ResultErrorJSON(w, r, http.StatusInternalServerError, "Unable to save User", nil)
				}
				return
			}

			if !self {
				err = userObject.SaveCapabilities()
				if err != nil {
					h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
					return
				}
			}

			// nolint: errcheck,gosec
			userObject.Expand(getExpandFromContext(r))

			h.ResultResponseJSON(w, r, http.StatusOK, userObject)
		default:
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
		}
	}
}

// DeleteUser removes a user
// Route: DELETE /users/{userID}
func DeleteUser() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		var userID uint
		var err error
		if userID, err = getURLParamInt(r, "userID"); err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		myUserID, _ := r.Context().Value(c.UserIDCtxKey).(uint)
		if myUserID == userID {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, "You cannot delete yourself!", nil)
			return
		}

		item, err := user.GetByID(userID)
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

// CreateUser creates a user
// Route: POST /users
func CreateUser() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		bodyBytes, _ := r.Context().Value(c.BodyCtxKey).([]byte)

		var newUser user.Model
		err := json.Unmarshal(bodyBytes, &newUser)
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, h.ErrInvalidPayload.Error(), nil)
			return
		}

		if err = newUser.Save(); err != nil {
			if err == errors.ErrDuplicateEmailUser || err == errors.ErrSystemUserReadonly {
				h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			} else {
				logger.Error("UpdateUserError", err)
				h.ResultErrorJSON(w, r, http.StatusInternalServerError, "Unable to save User", nil)
			}
			return
		}

		// Set the permissions to full-admin for this user
		if !config.IsSetup {
			newUser.Capabilities = []string{user.CapabilityFullAdmin}
		}

		// nolint: errcheck,gosec
		err = newUser.SaveCapabilities()
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusInternalServerError, err.Error(), nil)
			return
		}

		// newUser has been saved, now save their auth
		if newUser.Auth.Secret != "" && newUser.Auth.ID == 0 {
			newUser.Auth.UserID = newUser.ID
			if newUser.Auth.Type == auth.TypePassword {
				err = newUser.Auth.SetPassword(newUser.Auth.Secret)
				if err != nil {
					logger.Error("SetPasswordError", err)
				}
			}

			if err = newUser.Auth.Save(); err != nil {
				h.ResultErrorJSON(w, r, http.StatusInternalServerError, "Unable to save Authentication for User", nil)
				return
			}

			newUser.Auth.Secret = ""
		}

		if !config.IsSetup {
			config.IsSetup = true
			logger.Info("A new user was created, leaving Setup Mode")
		}

		h.ResultResponseJSON(w, r, http.StatusOK, newUser)
	}
}

// DeleteUsers is only available in debug mode for cypress tests
// Route: DELETE /users
func DeleteUsers() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		err := user.DeleteAll()
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
		} else {
			// also change setup to true
			config.IsSetup = false
			logger.Info("Users have been wiped, entering Setup Mode")
			h.ResultResponseJSON(w, r, http.StatusOK, true)
		}
	}
}

func getUserIDFromRequest(r *http.Request) (uint, bool, error) {
	userIDstr := chi.URLParam(r, "userID")
	selfUserID, _ := r.Context().Value(c.UserIDCtxKey).(uint)

	var userID uint
	self := false
	if userIDstr == "me" {
		// Get user id from Token
		userID = selfUserID
		self = true
	} else {
		var userIDerr error
		if userID, userIDerr = getURLParamInt(r, "userID"); userIDerr != nil {
			return 0, false, userIDerr
		}
		self = selfUserID == userID
	}
	return userID, self, nil
}
