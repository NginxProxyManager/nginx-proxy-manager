package handler

import (
	"encoding/json"
	"net/http"

	c "npm/internal/api/context"
	h "npm/internal/api/http"
	"npm/internal/entity/auth"
	"npm/internal/logger"
)

// SetAuth ...
// Route: POST /users/:userID/auth
func SetAuth() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		bodyBytes, _ := r.Context().Value(c.BodyCtxKey).([]byte)

		// TODO:
		// delete old auth for user
		// test endpoint

		var newAuth auth.Model
		err := json.Unmarshal(bodyBytes, &newAuth)
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, h.ErrInvalidPayload.Error(), nil)
			return
		}

		userID, _, userIDErr := getUserIDFromRequest(r)
		if userIDErr != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, userIDErr.Error(), nil)
			return
		}

		newAuth.UserID = userID
		if newAuth.Type == auth.TypePassword {
			err := newAuth.SetPassword(newAuth.Secret)
			if err != nil {
				logger.Error("SetPasswordError", err)
			}
		}

		if err = newAuth.Save(); err != nil {
			logger.Error("AuthSaveError", err)
			h.ResultErrorJSON(w, r, http.StatusInternalServerError, "Unable to save Authentication for User", nil)
			return
		}

		newAuth.Secret = ""

		h.ResultResponseJSON(w, r, http.StatusOK, newAuth)
	}
}
