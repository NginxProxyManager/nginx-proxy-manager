package handler

import (
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

	"github.com/go-chi/chi"
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

		users, err := user.List(pageInfo, middleware.GetFiltersFromContext(r))
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

		user, err := user.GetByID(userID)
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
		} else {
			h.ResultResponseJSON(w, r, http.StatusOK, user)
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

		user, err := user.GetByID(userID)
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
		} else {

			bodyBytes, _ := r.Context().Value(c.BodyCtxKey).([]byte)
			err := json.Unmarshal(bodyBytes, &user)
			if err != nil {
				h.ResultErrorJSON(w, r, http.StatusBadRequest, h.ErrInvalidPayload.Error(), nil)
				return
			}

			if user.IsDisabled && self {
				h.ResultErrorJSON(w, r, http.StatusBadRequest, "You cannot disable yourself!", nil)
				return
			}

			if err = user.Save(); err != nil {
				if err == errors.ErrDuplicateEmailUser {
					h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
				} else {
					h.ResultErrorJSON(w, r, http.StatusInternalServerError, "Unable to save User", nil)
				}
				return
			}

			h.ResultResponseJSON(w, r, http.StatusOK, user)
		}
	}
}

// DeleteUser removes a user
// Route: DELETE /users/{userID}
func DeleteUser() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		var userID int
		var err error
		if userID, err = getURLParamInt(r, "userID"); err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		myUserID, _ := r.Context().Value(c.UserIDCtxKey).(int)
		if myUserID == userID {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, "You cannot delete yourself!", nil)
			return
		}

		user, err := user.GetByID(userID)
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
		} else {
			h.ResultResponseJSON(w, r, http.StatusOK, user.Delete())
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
			if err == errors.ErrDuplicateEmailUser {
				h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			} else {
				h.ResultErrorJSON(w, r, http.StatusInternalServerError, "Unable to save User", nil)
			}
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

func getUserIDFromRequest(r *http.Request) (int, bool, error) {
	userIDstr := chi.URLParam(r, "userID")

	var userID int
	self := false
	if userIDstr == "me" {
		// Get user id from Token
		userID, _ = r.Context().Value(c.UserIDCtxKey).(int)
		self = true
	} else {
		var userIDerr error
		if userID, userIDerr = getURLParamInt(r, "userID"); userIDerr != nil {
			return 0, false, userIDerr
		}
	}
	return userID, self, nil
}
