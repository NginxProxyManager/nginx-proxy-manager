package handler

import (
	"encoding/json"
	"net/http"
	"time"

	c "npm/internal/api/context"
	h "npm/internal/api/http"
	"npm/internal/entity/auth"
	"npm/internal/entity/user"
	"npm/internal/errors"
	"npm/internal/logger"
)

type setAuthModel struct {
	Type          string
	Secret        string
	CurrentSecret string
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
		if thisUserErr != nil {
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

		if newAuth.Type == auth.TypePassword {
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
