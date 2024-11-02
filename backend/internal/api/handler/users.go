package handler

import (
	"encoding/json"
	"net/http"
	"time"

	c "npm/internal/api/context"
	h "npm/internal/api/http"
	"npm/internal/api/middleware"
	"npm/internal/config"
	"npm/internal/entity/auth"
	"npm/internal/entity/user"
	"npm/internal/errors"
	"npm/internal/logger"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
)

type setAuthModel struct {
	// The json tags are required, as the change password form decodes into this object
	Type          string `json:"type"`
	Secret        string `json:"secret"`
	CurrentSecret string `json:"current_secret"`
}

// GetUsers returns all users
// Route: GET /users
func GetUsers() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		pageInfo, err := getPageInfoFromRequest(r)
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		users, err := user.List(pageInfo, middleware.GetFiltersFromContext(r), middleware.GetExpandFromContext(r))
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
		case gorm.ErrRecordNotFound:
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
		case gorm.ErrRecordNotFound:
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
			userObject.Expand(middleware.GetExpandFromContext(r))

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
		case gorm.ErrRecordNotFound:
			h.NotFound(w, r)
		case nil:
			if err := item.Delete(); err != nil {
				h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			} else {
				h.ResultResponseJSON(w, r, http.StatusOK, true)
			}
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
			if newUser.Auth.Type == auth.TypeLocal {
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

// SetAuth sets a auth method. This can be used for "me" and `2` for example
// Route: POST /users/:userID/auth
func SetAuth() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		bodyBytes, _ := r.Context().Value(c.BodyCtxKey).([]byte)

		var newAuth setAuthModel
		err := json.Unmarshal(bodyBytes, &newAuth)
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, h.ErrInvalidPayload.Error(), nil)
			return
		}

		userID, isSelf, userIDErr := getUserIDFromRequest(r)
		if userIDErr != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, userIDErr.Error(), nil)
			return
		}

		// Load user
		thisUser, thisUserErr := user.GetByID(userID)
		if thisUserErr == gorm.ErrRecordNotFound {
			h.NotFound(w, r)
			return
		} else if thisUserErr != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, thisUserErr.Error(), nil)
			return
		}

		if thisUser.IsSystem {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, "Cannot set password for system user", nil)
			return
		}

		// Load existing auth for user
		userAuth, userAuthErr := auth.GetByUserIDType(userID, newAuth.Type)
		if userAuthErr != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, userAuthErr.Error(), nil)
			return
		}

		if isSelf {
			// confirm that the current_secret given is valid for the one stored in the database
			validateErr := userAuth.ValidateSecret(newAuth.CurrentSecret)
			if validateErr != nil {
				logger.Debug("%s: %s", "Password change: current password was incorrect", validateErr.Error())
				// Sleep for 1 second to prevent brute force password guessing
				time.Sleep(time.Second)

				h.ResultErrorJSON(w, r, http.StatusBadRequest, errors.ErrCurrentPasswordInvalid.Error(), nil)
				return
			}
		}

		if newAuth.Type == auth.TypeLocal {
			err := userAuth.SetPassword(newAuth.Secret)
			if err != nil {
				logger.Error("SetPasswordError", err)
				h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			}
		}

		if err = userAuth.Save(); err != nil {
			logger.Error("AuthSaveError", err)
			h.ResultErrorJSON(w, r, http.StatusInternalServerError, "Unable to save Authentication for User", nil)
			return
		}

		userAuth.Secret = ""

		// todo: add to audit-log

		h.ResultResponseJSON(w, r, http.StatusOK, userAuth)
	}
}
