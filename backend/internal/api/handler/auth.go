package handler

import (
	"encoding/json"
	"net/http"
	"slices"
	"time"

	c "npm/internal/api/context"
	h "npm/internal/api/http"
	"npm/internal/entity/auth"
	"npm/internal/entity/setting"
	"npm/internal/entity/user"
	"npm/internal/errors"
	njwt "npm/internal/jwt"
	"npm/internal/logger"

	"gorm.io/gorm"
)

// tokenPayload is the structure we expect from a incoming login request
type tokenPayload struct {
	Type     string `json:"type"`
	Identity string `json:"identity"`
	Secret   string `json:"secret"`
}

// GetAuthConfig is anonymous and returns the types of authentication
// enabled for this site
func GetAuthConfig() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		val, err := setting.GetAuthMethods()
		if err == gorm.ErrRecordNotFound {
			h.ResultResponseJSON(w, r, http.StatusOK, nil)
			return
		} else if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}
		h.ResultResponseJSON(w, r, http.StatusOK, val)
	}
}

// NewToken Also known as a Login, requesting a new token with credentials
// Route: POST /auth
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

		// Check that this auth type is enabled
		if authMethods, err := setting.GetAuthMethods(); err == gorm.ErrRecordNotFound {
			h.ResultResponseJSON(w, r, http.StatusOK, nil)
			return
		} else if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		} else if !slices.Contains(authMethods, payload.Type) {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, errors.ErrInvalidAuthType.Error(), nil)
			return
		}

		switch payload.Type {
		case "ldap":
			newTokenLDAP(w, r, payload)
		case "local":
			newTokenLocal(w, r, payload)
		}
	}
}

func newTokenLocal(w http.ResponseWriter, r *http.Request, payload tokenPayload) {
	// Find user by email
	userObj, userErr := user.GetByEmail(payload.Identity)
	if userErr != nil {
		logger.Debug("%s: %s", errors.ErrInvalidLogin.Error(), userErr.Error())
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

func newTokenLDAP(w http.ResponseWriter, r *http.Request, payload tokenPayload) {
	// Get LDAP settings
	ldapSettings, err := setting.GetLDAPSettings()
	if err != nil {
		logger.Error("LDAP settings not found", err)
		h.ResultErrorJSON(w, r, http.StatusInternalServerError, err.Error(), nil)
		return
	}

	// Lets try to authenticate with LDAP
	ldapUser, err := auth.LDAPAuthenticate(payload.Identity, payload.Secret)
	if err != nil {
		logger.Error("LDAP Auth Error", err)
		h.ResultErrorJSON(w, r, http.StatusBadRequest, errors.ErrInvalidLogin.Error(), nil)
		return
	}

	// Get Auth by identity
	authObj, authErr := auth.GetByIdenityType(ldapUser.Username, payload.Type)
	if authErr == gorm.ErrRecordNotFound {
		// Auth is not found for this identity. We can create it
		if !ldapSettings.AutoCreateUser {
			// LDAP Login was successful, but user does not have an auth record
			// and auto create is disabled. Showing account disabled error
			// for the time being
			h.ResultErrorJSON(w, r, http.StatusBadRequest, errors.ErrUserDisabled.Error(), nil)
			return
		}

		// Attempt to find user by email
		foundUser, err := user.GetByEmail(ldapUser.Email)
		if err == gorm.ErrRecordNotFound {
			// User not found, create user
			foundUser, err = user.CreateFromLDAPUser(ldapUser)
			if err != nil {
				logger.Error("user.CreateFromLDAPUser", err)
				h.ResultErrorJSON(w, r, http.StatusInternalServerError, err.Error(), nil)
				return
			}
			logger.Info("Created user from LDAP: %s, %s", ldapUser.Username, foundUser.Email)
		} else if err != nil {
			logger.Error("user.GetByEmail", err)
			h.ResultErrorJSON(w, r, http.StatusInternalServerError, err.Error(), nil)
			return
		}

		// Create auth record and attach to this user
		authObj = auth.Model{
			UserID:   foundUser.ID,
			Type:     auth.TypeLDAP,
			Identity: ldapUser.Username,
		}
		if err := authObj.Save(); err != nil {
			logger.Error("auth.Save", err)
			h.ResultErrorJSON(w, r, http.StatusInternalServerError, err.Error(), nil)
			return
		}
		logger.Info("Created LDAP auth for user: %s, %s", ldapUser.Username, foundUser.Email)
	} else if authErr != nil {
		logger.Error("auth.GetByIdenityType", err)
		h.ResultErrorJSON(w, r, http.StatusInternalServerError, authErr.Error(), nil)
		return
	}

	userObj, userErr := user.GetByID(authObj.UserID)
	if userErr != nil {
		h.ResultErrorJSON(w, r, http.StatusBadRequest, userErr.Error(), nil)
		return
	}

	if userObj.IsDisabled {
		h.ResultErrorJSON(w, r, http.StatusUnauthorized, errors.ErrUserDisabled.Error(), nil)
		return
	}

	if response, err := njwt.Generate(&userObj, false); err != nil {
		h.ResultErrorJSON(w, r, http.StatusInternalServerError, err.Error(), nil)
	} else {
		h.ResultResponseJSON(w, r, http.StatusOK, response)
	}
}

// RefreshToken an existing token by given them a new one with the same claims
// Route: POST /auth/refresh
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
// Route: POST /auth/sse
func NewSSEToken() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := r.Context().Value(c.UserIDCtxKey).(uint)

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
