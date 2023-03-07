package handler

import (
	"encoding/json"
	"net/http"
	h "npm/internal/api/http"
	"npm/internal/errors"
	"npm/internal/logger"
	"time"

	c "npm/internal/api/context"
	"npm/internal/entity/auth"
	"npm/internal/entity/user"
	njwt "npm/internal/jwt"
)

// tokenPayload is the structure we expect from a incoming login request
type tokenPayload struct {
	Type     string `json:"type"`
	Identity string `json:"identity"`
	Secret   string `json:"secret"`
}

// NewToken Also known as a Login, requesting a new token with credentials
// Route: POST /tokens
func NewToken() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		// Read the bytes from the body
		bodyBytes, _ := r.Context().Value(c.BodyCtxKey).([]byte)

		var payload tokenPayload
		err := json.Unmarshal(bodyBytes, &payload)
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, h.ErrInvalidPayload.Error(), nil)
			return
		}

		// Find user
		userObj, userErr := user.GetByEmail(payload.Identity)
		if userErr != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, errors.ErrInvalidLogin.Error(), nil)
			return
		}

		if userObj.IsDisabled {
			h.ResultErrorJSON(w, r, http.StatusUnauthorized, errors.ErrUserDisabled.Error(), nil)
			return
		}

		// Get Auth
		authObj, authErr := auth.GetByUserIDType(userObj.ID, payload.Type)
		if authErr != nil {
			logger.Debug("%s: %s", errors.ErrInvalidLogin.Error(), authErr.Error())
			h.ResultErrorJSON(w, r, http.StatusBadRequest, errors.ErrInvalidLogin.Error(), nil)
			return
		}

		// Verify Auth
		validateErr := authObj.ValidateSecret(payload.Secret)
		if validateErr != nil {
			logger.Debug("%s: %s", errors.ErrInvalidLogin.Error(), validateErr.Error())
			// Sleep for 1 second to prevent brute force password guessing
			time.Sleep(time.Second)
			h.ResultErrorJSON(w, r, http.StatusBadRequest, errors.ErrInvalidLogin.Error(), nil)
			return
		}

		if response, err := njwt.Generate(&userObj, false); err != nil {
			h.ResultErrorJSON(w, r, http.StatusInternalServerError, err.Error(), nil)
		} else {
			h.ResultResponseJSON(w, r, http.StatusOK, response)
		}
	}
}

// RefreshToken an existing token by given them a new one with the same claims
// Route: GET /tokens
func RefreshToken() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		// TODO: Use your own methods to verify an existing user is
		// able to refresh their token and then give them a new one
		userObj, _ := user.GetByEmail("jc@jc21.com")
		if response, err := njwt.Generate(&userObj, false); err != nil {
			h.ResultErrorJSON(w, r, http.StatusInternalServerError, err.Error(), nil)
		} else {
			h.ResultResponseJSON(w, r, http.StatusOK, response)
		}
	}
}

// NewSSEToken will generate and return a very short lived token for
// use by the /sse/* endpoint. It requires an app token to generate this
// Route: POST /tokens/sse
func NewSSEToken() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := r.Context().Value(c.UserIDCtxKey).(int)

		// Find user
		userObj, userErr := user.GetByID(userID)
		if userErr != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, errors.ErrInvalidLogin.Error(), nil)
			return
		}

		if userObj.IsDisabled {
			h.ResultErrorJSON(w, r, http.StatusUnauthorized, errors.ErrUserDisabled.Error(), nil)
			return
		}

		if response, err := njwt.Generate(&userObj, true); err != nil {
			h.ResultErrorJSON(w, r, http.StatusInternalServerError, err.Error(), nil)
		} else {
			h.ResultResponseJSON(w, r, http.StatusOK, response)
		}
	}
}
