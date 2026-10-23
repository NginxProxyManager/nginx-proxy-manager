package handler

import (
	"encoding/json"
	"net/http"
	"slices"
	"time"

	c "npm/internal/api/context"
	h "npm/internal/api/http"
	"npm/internal/api/middleware"
	"npm/internal/authpolicy"
	"npm/internal/config"
	"npm/internal/database"
	"npm/internal/entity/auth"
	"npm/internal/entity/session"
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
		if err == nil {
			if items, ok := users.Items.([]user.Model); ok {
				for idx := range items {
					if populateErr := items[idx].PopulateAccessFieldsInTx(database.GetDB()); populateErr != nil {
						err = populateErr
						break
					}
				}
				users.Items = items
			}
		}
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
			if err := item.PopulateAccessFieldsInTx(database.GetDB()); err != nil {
				h.ResultErrorJSON(w, r, http.StatusInternalServerError, "Unable to load User", nil)
				return
			}
			if chi.URLParam(r, "userID") == "me" {
				if principal, ok := middleware.CurrentPrincipal(r.Context()); ok {
					item.Capabilities = principal.Capabilities
				}
				if item.Capabilities == nil {
					item.Capabilities = []string{}
				}
				h.ResultResponseJSON(w, r, http.StatusOK, struct {
					user.Model
					Capabilities []string `json:"capabilities"`
				}{Model: item, Capabilities: item.Capabilities})
				return
			}
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
		userID, _, err := getUserIDFromRequest(r)
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}
		var userObject user.Model
		status, message := http.StatusInternalServerError, "Unable to save User"
		err = authpolicy.WithMutation(r.Context(), func(tx *gorm.DB) error {
			actor, code, err := currentUserMutationActor(tx, r)
			if err != nil {
				status, message = code, "Unauthorised"
				return err
			}
			if chi.URLParam(r, "userID") == "me" {
				userID = actor.Session.UserID
			}
			self := userID == actor.Session.UserID
			if len(actor.Capabilities) == 0 || (!self && !canManageUsers(actor)) {
				status, message = http.StatusForbidden, "Forbidden"
				return session.ErrUnauthorized
			}
			userObject, err = user.GetByIDInTx(tx, userID)
			if err != nil {
				if err == gorm.ErrRecordNotFound {
					status, message = http.StatusNotFound, "Not found"
				}
				return err
			}
			userObject.Capabilities, err = user.GetCapabilitiesInTx(tx, userID)
			if err != nil {
				return err
			}
			// Merge only mutable API fields into the freshly loaded record. Self-service
			// cannot persist policy fields or echo requested capabilities as actual grants.
			var patch struct {
				Name                 *string   `json:"name"`
				Email                *string   `json:"email"`
				IsDisabled           *bool     `json:"is_disabled"`
				Capabilities         *[]string `json:"capabilities"`
				PasswordLoginEnabled *bool     `json:"password_login_enabled"`
			}
			body, _ := r.Context().Value(c.BodyCtxKey).([]byte)
			if err = json.Unmarshal(body, &patch); err != nil {
				status, message = http.StatusBadRequest, h.ErrInvalidPayload.Error()
				return err
			}
			if self && patch.IsDisabled != nil && *patch.IsDisabled {
				status, message = http.StatusBadRequest, "You cannot disable yourself!"
				return h.ErrInvalidPayload
			}
			if self && slices.Contains(userObject.Capabilities, user.CapabilityFullAdmin) && patch.Capabilities != nil && !slices.Contains(*patch.Capabilities, user.CapabilityFullAdmin) {
				status, message = http.StatusBadRequest, "You cannot remove your own full-admin capability!"
				return h.ErrInvalidPayload
			}
			if patch.PasswordLoginEnabled != nil {
				targetCapabilities := userObject.Capabilities
				if !self && patch.Capabilities != nil {
					targetCapabilities = *patch.Capabilities
				}
				if self || !slices.Contains(actor.Capabilities, user.CapabilityFullAdmin) || !slices.Contains(targetCapabilities, user.CapabilityFullAdmin) {
					status, message = http.StatusForbidden, "Forbidden"
					return session.ErrUnauthorized
				}
				userObject.AdminPasswordEnabled = *patch.PasswordLoginEnabled
			}
			if patch.Name != nil {
				userObject.Name = *patch.Name
			}
			if patch.Email != nil {
				userObject.Email = *patch.Email
			}
			if !self && patch.IsDisabled != nil {
				userObject.IsDisabled = *patch.IsDisabled
			}
			if !self && patch.Capabilities != nil {
				userObject.Capabilities = *patch.Capabilities
				if !slices.Contains(userObject.Capabilities, user.CapabilityFullAdmin) {
					userObject.AdminPasswordEnabled = false
				}
			}
			if err = userObject.SaveInTx(tx); err != nil {
				if err == errors.ErrDuplicateEmailUser || err == errors.ErrSystemUserReadonly {
					status, message = http.StatusBadRequest, err.Error()
				}
				return err
			}
			if !self && patch.Capabilities != nil {
				if err = userObject.SaveCapabilitiesInTx(tx); err != nil {
					status, message = http.StatusBadRequest, err.Error()
					return err
				}
			}
			return nil
		})
		if err != nil {
			h.ResultErrorJSON(w, r, status, message, nil)
			return
		}
		if err := userObject.PopulateAccessFieldsInTx(database.GetDB()); err != nil {
			h.ResultErrorJSON(w, r, http.StatusInternalServerError, "Unable to load User", nil)
			return
		}
		h.ResultResponseJSON(w, r, http.StatusOK, userObject)
	}
}

// Revalidate the middleware-authenticated actor inside the already-held fence.
// A UID without a principal/session is never sufficient for a mutation.
func currentUserMutationActor(tx *gorm.DB, r *http.Request) (session.Principal, int, error) {
	supplied, ok := middleware.CurrentPrincipal(r.Context())
	if !ok {
		return session.Principal{}, http.StatusUnauthorized, session.ErrUnauthorized
	}
	current, err := session.AuthorizeInTx(tx, supplied.Session.ID, time.Now().UTC())
	if err != nil || current.Session.UserID != supplied.Session.UserID {
		return session.Principal{}, http.StatusUnauthorized, session.ErrUnauthorized
	}
	return current, http.StatusOK, nil
}

func canManageUsers(p session.Principal) bool {
	return slices.Contains(p.Capabilities, user.CapabilityFullAdmin) || slices.Contains(p.Capabilities, user.CapabilityUsersManage)
}

// DeleteUser removes a user
// Route: DELETE /users/{userID}
func DeleteUser() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, err := getURLParamInt(r, "userID")
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}
		status, message := http.StatusBadRequest, ""
		err = authpolicy.WithMutation(r.Context(), func(tx *gorm.DB) error {
			actor, code, err := currentUserMutationActor(tx, r)
			if err != nil {
				status, message = code, "Unauthorised"
				return err
			}
			if !canManageUsers(actor) {
				status, message = http.StatusForbidden, "Forbidden"
				return session.ErrUnauthorized
			}
			if actor.Session.UserID == userID {
				message = "You cannot delete yourself!"
				return h.ErrInvalidPayload
			}
			item, err := user.GetByIDInTx(tx, userID)
			if err != nil {
				if err == gorm.ErrRecordNotFound {
					status, message = http.StatusNotFound, "Not found"
				}
				return err
			}
			if err := revokeUserSessions(tx, []uint{item.ID}); err != nil {
				return err
			}
			return item.DeleteInTx(tx)
		})
		if err != nil {
			if message == "" {
				message = err.Error()
			}
			h.ResultErrorJSON(w, r, status, message, nil)
			return
		}
		h.ResultResponseJSON(w, r, http.StatusOK, true)
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
		if !config.IsSetup {
			newUser.AdminPasswordEnabled = true
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
		status, message := http.StatusBadRequest, ""
		err := authpolicy.WithMutation(r.Context(), func(tx *gorm.DB) error {
			actor, code, err := currentUserMutationActor(tx, r)
			if err != nil {
				status, message = code, "Unauthorised"
				return err
			}
			if !slices.Contains(actor.Capabilities, user.CapabilityFullAdmin) {
				status, message = http.StatusForbidden, "Forbidden"
				return session.ErrUnauthorized
			}
			var ids []uint
			if err := tx.Model(&user.Model{}).Where("is_system = ?", false).Pluck("id", &ids).Error; err != nil {
				return err
			}
			if err := revokeUserSessions(tx, ids); err != nil {
				return err
			}
			return user.DeleteAllInTx(tx)
		})
		if err != nil {
			if message == "" {
				message = err.Error()
			}
			h.ResultErrorJSON(w, r, status, message, nil)
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
		if isSelf {
			if principal, ok := middleware.CurrentPrincipal(r.Context()); ok && len(principal.Capabilities) == 0 {
				h.ResultErrorJSON(w, r, http.StatusForbidden, "Forbidden", nil)
				return
			}
		}
		if !isSelf {
			if newAuth.Type != auth.TypeLocal {
				h.ResultErrorJSON(w, r, http.StatusBadRequest, "Only local credentials can be provisioned", nil)
				return
			}
			var userAuth auth.Model
			status, message := http.StatusInternalServerError, "Unable to save Authentication for User"
			err = authpolicy.WithMutation(r.Context(), func(tx *gorm.DB) error {
				actor, code, actorErr := currentUserMutationActor(tx, r)
				if actorErr != nil {
					status, message = code, "Unauthorised"
					return actorErr
				}
				if !canManageUsers(actor) {
					status, message = http.StatusForbidden, "Forbidden"
					return session.ErrUnauthorized
				}
				target, targetErr := user.GetByIDInTx(tx, userID)
				if targetErr != nil {
					if targetErr == gorm.ErrRecordNotFound {
						status, message = http.StatusNotFound, "Not found"
					}
					return targetErr
				}
				if target.IsSystem {
					status, message = http.StatusBadRequest, "Cannot set password for system user"
					return errors.ErrSystemUserReadonly
				}
				userAuth, targetErr = auth.GetByUserIDTypeInTx(tx, userID, auth.TypeLocal)
				if targetErr == gorm.ErrRecordNotFound {
					userAuth = auth.Model{UserID: userID, Type: auth.TypeLocal}
				} else if targetErr != nil {
					return targetErr
				}
				if targetErr = userAuth.SetPassword(newAuth.Secret); targetErr != nil {
					status, message = http.StatusBadRequest, targetErr.Error()
					return targetErr
				}
				if targetErr = userAuth.SaveInTx(tx); targetErr != nil {
					return targetErr
				}
				if target.CredentialOrigin == "sso" {
					target.CredentialOrigin = "local"
					if targetErr = target.SaveInTx(tx); targetErr != nil {
						return targetErr
					}
				}
				return nil
			})
			if err != nil {
				h.ResultErrorJSON(w, r, status, message, nil)
				return
			}
			userAuth.Secret = ""
			h.ResultResponseJSON(w, r, http.StatusOK, userAuth)
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
		if isSelf && thisUser.CredentialOrigin == "sso" {
			h.ResultErrorJSON(w, r, http.StatusForbidden, "Forbidden", nil)
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

// The caller holds the policy fence. Persist revocation before deletion so an
// eventual reused database user ID cannot resurrect an old JWT/session.
func revokeUserSessions(tx *gorm.DB, userIDs []uint) error {
	if len(userIDs) == 0 {
		return nil
	}
	var ids []string
	if err := tx.Model(&session.Model{}).Where("user_id IN ?", userIDs).Pluck("id", &ids).Error; err != nil {
		return err
	}
	now := time.Now().UTC()
	for _, id := range ids {
		if err := session.RevokeMatching(tx, session.RevocationFilter{SessionID: id}, now); err != nil {
			return err
		}
	}
	return nil
}
