package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	h "npm/internal/api/http"
	"npm/internal/entity/auth"
	"npm/internal/entity/setting"
	"npm/internal/entity/user"
	"npm/internal/errors"
	njwt "npm/internal/jwt"
	"npm/internal/logger"

	"gorm.io/gorm"
)

// getRequestIPAddress will use X-FORWARDED-FOR header if it exists
// otherwise it will use RemoteAddr
func getRequestIPAddress(r *http.Request) string {
	// this Get is case insensitive
	xff := r.Header.Get("X-FORWARDED-FOR")
	if xff != "" {
		ip, _, _ := strings.Cut(xff, ",")
		return strings.TrimSpace(ip)
	}
	return r.RemoteAddr
}

// OAuthLogin ...
// Route: GET /oauth/login
func OAuthLogin() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		if !setting.AuthMethodEnabled(auth.TypeOAuth) {
			h.ResultErrorJSON(w, r, http.StatusNotFound, "Not found", nil)
			return
		}

		redirectBase, _ := getQueryVarString(r, "redirect_base", false, "")
		url, err := auth.OAuthLogin(redirectBase, getRequestIPAddress(r))
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		h.ResultResponseJSON(w, r, http.StatusOK, url)
	}
}

// OAuthRedirect ...
// Route: GET /oauth/redirect
func OAuthRedirect() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		if !setting.AuthMethodEnabled(auth.TypeOAuth) {
			h.ResultErrorJSON(w, r, http.StatusNotFound, "Not found", nil)
			return
		}

		code, err := getQueryVarString(r, "code", true, "")
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		ou, err := auth.OAuthReturn(r.Context(), code, getRequestIPAddress(r))
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		if ou.Identifier == "" {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, "User found, but OAuth identifier seems misconfigured", nil)
			return
		}

		jwt, err := newTokenOAuth(ou)
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusInternalServerError, err.Error(), nil)
			return
		}

		// encode jwt to json
		j, _ := json.Marshal(jwt)

		// Redirect to frontend with success
		http.Redirect(w, r, fmt.Sprintf("/?token_response=%s", url.QueryEscape(string(j))), http.StatusSeeOther)
	}
}

// newTokenOAuth takes a OAuthUser and creates a new token,
// optionally creating a new user if one does not exist
func newTokenOAuth(ou *auth.OAuthUser) (*njwt.GeneratedResponse, error) {
	// Get OAuth settings
	oAuthSettings, err := setting.GetOAuthSettings()
	if err != nil {
		logger.Error("OAuth settings not found", err)
		return nil, err
	}

	// Get Auth by identity
	authObj, authErr := auth.GetByIdenityType(ou.GetID(), auth.TypeOAuth)
	if authErr == gorm.ErrRecordNotFound {
		// Auth is not found for this identity. We can create it
		if !oAuthSettings.AutoCreateUser {
			// user does not have an auth record
			// and auto create is disabled. Showing account disabled error
			// for the time being
			return nil, errors.ErrUserDisabled
		}

		// Attempt to find user by email
		foundUser, err := user.GetByEmail(ou.GetEmail())
		if err == gorm.ErrRecordNotFound {
			// User not found, create user
			foundUser, err = user.CreateFromOAuthUser(ou)
			if err != nil {
				logger.Error("user.CreateFromOAuthUser", err)
				return nil, err
			}
			logger.Info("Created user from OAuth: %s, %s", ou.GetID(), foundUser.Email)
		} else if err != nil {
			logger.Error("user.GetByEmail", err)
			return nil, err
		}

		// Create auth record and attach to this user
		authObj = auth.Model{
			UserID:   foundUser.ID,
			Type:     auth.TypeOAuth,
			Identity: ou.GetID(),
		}
		if err := authObj.Save(); err != nil {
			logger.Error("auth.Save", err)
			return nil, err
		}
		logger.Info("Created OAuth auth for user: %s, %s", ou.GetID(), foundUser.Email)
	} else if authErr != nil {
		logger.Error("auth.GetByIdenityType", err)
		return nil, authErr
	}

	userObj, userErr := user.GetByID(authObj.UserID)
	if userErr != nil {
		return nil, userErr
	}

	if userObj.IsDisabled {
		return nil, errors.ErrUserDisabled
	}

	jwt, err := njwt.Generate(&userObj, false)
	return &jwt, err
}
