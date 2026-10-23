package handler

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"net/http"
	"slices"
	"time"

	h "npm/internal/api/http"
	"npm/internal/api/middleware"
	"npm/internal/authpolicy"
	"npm/internal/entity/session"
	"npm/internal/entity/sso"
	"npm/internal/entity/user"
	njwt "npm/internal/jwt"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
	"strconv"
)

func newSessionID() (string, error) {
	var raw [32]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(raw[:]), nil
}

func createLoginSession(ctx context.Context, account user.Model, source session.Source) (njwt.GeneratedResponse, error) {
	id, err := newSessionID()
	if err != nil {
		return njwt.GeneratedResponse{}, err
	}
	now := time.Now().UTC()
	err = authpolicy.WithWrite(ctx, func(tx *gorm.DB) error {
		var live user.Model
		if err := tx.First(&live, account.ID).Error; err != nil {
			return err
		}
		if live.IsDisabled || live.IsSystem {
			return session.ErrUnauthorized
		}
		policy, err := sso.GetPolicy(tx)
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		if policy.Mode == sso.SSOOnly {
			if !live.AdminPasswordEnabled {
				return session.ErrUnauthorized
			}
			var count int64
			if err := tx.Model(&user.HasCapabilityModel{}).Where("user_id = ? AND capability_name = ?", live.ID, user.CapabilityFullAdmin).Count(&count).Error; err != nil {
				return err
			}
			if count == 0 {
				return session.ErrUnauthorized
			}
		}
		return session.Create(tx, session.Model{ID: id, UserID: live.ID, Source: source, CreatedAt: now, ExpiresAt: now.Add(24 * time.Hour)})
	})
	if err != nil {
		return njwt.GeneratedResponse{}, err
	}
	return njwt.GenerateForSession(account.ID, id, false)
}

func Logout() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		principal, ok := middleware.CurrentPrincipal(r.Context())
		if !ok {
			h.ResultErrorJSON(w, r, http.StatusUnauthorized, "Unauthorised", nil)
			return
		}
		if err := session.Revoke(r.Context(), principal.Session.ID, time.Now().UTC()); err != nil {
			h.ResultErrorJSON(w, r, http.StatusInternalServerError, "Unable to end session", nil)
			return
		}
		h.ResultResponseJSON(w, r, http.StatusOK, true)
	}
}

func Impersonate() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		actor, ok := middleware.CurrentPrincipal(r.Context())
		if !ok {
			h.ResultErrorJSON(w, r, http.StatusUnauthorized, "Unauthorised", nil)
			return
		}
		targetID, err := strconv.ParseUint(chi.URLParam(r, "userID"), 10, 32)
		if err != nil || targetID == 0 {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, "Invalid user", nil)
			return
		}
		id, err := newSessionID()
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusInternalServerError, "Unable to create session", nil)
			return
		}
		now := time.Now().UTC()
		err = authpolicy.WithWrite(r.Context(), func(tx *gorm.DB) error {
			fresh, err := session.AuthorizeInTx(tx, actor.Session.ID, now)
			if err != nil {
				return err
			}
			if !slices.Contains(fresh.Capabilities, user.CapabilityUsersManage) && !slices.Contains(fresh.Capabilities, user.CapabilityFullAdmin) {
				return session.ErrUnauthorized
			}
			var target user.Model
			if err := tx.First(&target, uint(targetID)).Error; err != nil {
				return err
			}
			if target.IsDisabled || target.IsSystem {
				return session.ErrUnauthorized
			}
			var count int64
			if err := tx.Model(&user.HasCapabilityModel{}).Where("user_id = ?", target.ID).Count(&count).Error; err != nil {
				return err
			}
			if count == 0 {
				return session.ErrUnauthorized
			}
			expiry := now.Add(24 * time.Hour)
			if expiry.After(fresh.Session.ExpiresAt) {
				expiry = fresh.Session.ExpiresAt
			}
			return session.Create(tx, session.Model{ID: id, UserID: target.ID, Source: session.Impersonation, ParentID: fresh.Session.ID, CreatedAt: now, ExpiresAt: expiry})
		})
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusForbidden, "Forbidden", nil)
			return
		}
		response, err := njwt.GenerateForSession(uint(targetID), id, false)
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusUnauthorized, "Unauthorised", nil)
			return
		}
		h.ResultResponseJSON(w, r, http.StatusOK, response)
	}
}
