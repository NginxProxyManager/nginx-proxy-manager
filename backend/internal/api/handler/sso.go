package handler

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"

	c "npm/internal/api/context"
	h "npm/internal/api/http"
	"npm/internal/config"
	"npm/internal/database"
	ssoconfig "npm/internal/entity/sso"
	"npm/internal/jwt"
	protocols "npm/internal/sso"

	"github.com/go-chi/chi/v5"
)

var browserSSO = struct {
	sync.RWMutex
	service  *protocols.Service
	metadata func(*http.Request, ssoconfig.Connection, string) ([]byte, error)
}{}

func RegisterBrowserSSO(service *protocols.Service, metadata func(*http.Request, ssoconfig.Connection, string) ([]byte, error)) {
	browserSSO.Lock()
	defer browserSSO.Unlock()
	browserSSO.service, browserSSO.metadata = service, metadata
}

func browserService() *protocols.Service {
	browserSSO.RLock()
	defer browserSSO.RUnlock()
	return browserSSO.service
}

func SSOProviders() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !config.IsSetup || database.GetDB() == nil {
			h.ResultErrorJSON(w, r, http.StatusForbidden, "sso_bootstrap_required", nil)
			return
		}
		policy, err := ssoconfig.GetPolicy(database.GetDB().WithContext(r.Context()))
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusServiceUnavailable, "sso_configuration_unavailable", nil)
			return
		}
		out := struct {
			Mode        ssoconfig.LoginMode `json:"mode"`
			Password    bool                `json:"password_login_available"`
			Connections []struct {
				ID       string             `json:"id"`
				Name     string             `json:"name"`
				Protocol ssoconfig.Protocol `json:"protocol"`
			} `json:"connections"`
		}{Mode: policy.Mode, Password: policy.Mode != ssoconfig.SSOOnly, Connections: make([]struct {
			ID       string             `json:"id"`
			Name     string             `json:"name"`
			Protocol ssoconfig.Protocol `json:"protocol"`
		}, 0)}
		var rows []ssoconfig.Connection
		if err := database.GetDB().WithContext(r.Context()).Where("enabled = ?", true).Order("name, id").Find(&rows).Error; err != nil {
			h.ResultErrorJSON(w, r, http.StatusServiceUnavailable, "sso_configuration_unavailable", nil)
			return
		}
		if ssoconfig.ValidatePublicURL(policy.PublicURL) == nil && browserService() != nil {
			for _, row := range rows {
				if ssoconfig.ValidateConfig(row.Protocol, row.ConfigJSON) == nil && len(row.SecretCiphertext) > 0 {
					out.Connections = append(out.Connections, struct {
						ID       string             `json:"id"`
						Name     string             `json:"name"`
						Protocol ssoconfig.Protocol `json:"protocol"`
					}{row.ID, row.Name, row.Protocol})
				}
			}
		}
		w.Header().Set("Cache-Control", "no-store")
		h.ResultResponseJSON(w, r, http.StatusOK, out)
	}
}

func SSOStart() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		service := browserService()
		if !config.IsSetup || service == nil {
			h.ResultErrorJSON(w, r, http.StatusForbidden, "sso_bootstrap_required", nil)
			return
		}
		id := chi.URLParam(r, "id")
		path := r.URL.Query().Get("return_path")
		if len(r.URL.Query()["return_path"]) > 1 || protocols.ValidateReturnPath(path) != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, "sso_invalid_return_path", nil)
			return
		}
		browser, err := service.NewBrowserToken()
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusForbidden, "sso_login_denied", nil)
			return
		}
		result, err := service.Begin(r.Context(), id, browser, path)
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusForbidden, "sso_login_denied", nil)
			return
		}
		connection, err := ssoconfig.GetConnection(database.GetDB(), id)
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusForbidden, "sso_login_denied", nil)
			return
		}
		http.SetCookie(w, protocols.AttemptCookie(result.AttemptID, browser, connection.Protocol))
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Referrer-Policy", "no-referrer")
		http.Redirect(w, r, result.RedirectURL, http.StatusFound)
	}
}

func SSOCallback() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Referrer-Policy", "no-referrer")
		service := browserService()
		if !config.IsSetup || service == nil {
			http.Redirect(w, r, "/login?sso_error=sso_login_denied", http.StatusSeeOther)
			return
		}
		id := chi.URLParam(r, "id")
		if r.Method == http.MethodPost {
			body, _ := r.Context().Value(c.BodyCtxKey).([]byte)
			r.Body = io.NopCloser(bytes.NewReader(body))
		}
		state, err := protocols.CallbackState(r)
		if err != nil {
			http.Redirect(w, r, "/login?sso_error=sso_login_denied", http.StatusSeeOther)
			return
		}
		attempt, err := service.AttemptID(r.Context(), id, state)
		if err != nil {
			http.Redirect(w, r, "/login?sso_error=sso_login_denied", http.StatusSeeOther)
			return
		}
		cookie, err := r.Cookie("__Host-npm-sso-attempt-" + attempt)
		if err != nil {
			http.Redirect(w, r, "/login?sso_error=sso_login_denied", http.StatusSeeOther)
			return
		}
		// A callback consumes its own attempt; another browser tab keeps its cookie.
		http.SetCookie(w, protocols.DeleteCookie(cookie))
		code, err := service.Complete(r.Context(), id, cookie.Value, r)
		if err != nil {
			codeName := "sso_login_denied"
			if errors.Is(err, protocols.ErrSAMLUnsupported) {
				codeName = "sso_saml_unsupported_profile"
			}
			http.Redirect(w, r, "/login?sso_error="+codeName, http.StatusSeeOther)
			return
		}
		http.SetCookie(w, protocols.HandoffCookie(code, cookie.Value))
		http.Redirect(w, r, "/login?sso_handoff="+url.QueryEscape(code), http.StatusSeeOther)
	}
}

func SSOMetadata() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		browserSSO.RLock()
		metadata := browserSSO.metadata
		browserSSO.RUnlock()
		if !config.IsSetup || metadata == nil || database.GetDB() == nil {
			h.ResultErrorJSON(w, r, http.StatusForbidden, "sso_bootstrap_required", nil)
			return
		}
		policy, err := ssoconfig.GetPolicy(database.GetDB().WithContext(r.Context()))
		if err != nil || ssoconfig.ValidatePublicURL(policy.PublicURL) != nil {
			h.ResultErrorJSON(w, r, http.StatusForbidden, "sso_login_denied", nil)
			return
		}
		connection, err := ssoconfig.GetConnection(database.GetDB().WithContext(r.Context()), chi.URLParam(r, "id"))
		if err != nil || connection.Protocol != ssoconfig.SAML || len(connection.SecretCiphertext) == 0 {
			h.ResultErrorJSON(w, r, http.StatusNotFound, "sso_login_denied", nil)
			return
		}
		body, err := metadata(r, connection, policy.PublicURL)
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusForbidden, "sso_login_denied", nil)
			return
		}
		w.Header().Set("Content-Type", "application/samlmetadata+xml")
		w.Header().Set("Cache-Control", "no-store")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(body)
	}
}

func SSOExchange() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Referrer-Policy", "no-referrer")
		service := browserService()
		if !config.IsSetup || service == nil || !sameSSOOrigin(r) {
			h.ResultErrorJSON(w, r, http.StatusForbidden, "sso_login_denied", nil)
			return
		}
		var input struct {
			Code string `json:"code"`
		}
		body, _ := r.Context().Value(c.BodyCtxKey).([]byte)
		decoder := json.NewDecoder(bytes.NewReader(body))
		decoder.DisallowUnknownFields()
		if len(body) > 4096 || decoder.Decode(&input) != nil || decoder.Decode(new(any)) != io.EOF || len(input.Code) != 43 {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, "sso_login_denied", nil)
			return
		}
		cookieName := protocols.HandoffCookie(input.Code, "").Name
		cookie, err := r.Cookie(cookieName)
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusForbidden, "sso_login_denied", nil)
			return
		}
		http.SetCookie(w, protocols.DeleteCookie(cookie))
		model, err := service.Exchange(r.Context(), input.Code, cookie.Value)
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusForbidden, "sso_login_denied", nil)
			return
		}
		result, err := jwt.GenerateForSession(model.UserID, model.ID, false)
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusForbidden, "sso_login_denied", nil)
			return
		}
		h.ResultResponseJSON(w, r, http.StatusOK, result)
	}
}

// A browser supplied Origin or Referer must match the trusted policy origin.
// Non-browser Bearer clients can omit both headers.
func sameSSOOrigin(r *http.Request) bool {
	if database.GetDB() == nil {
		return false
	}
	policy, err := ssoconfig.GetPolicy(database.GetDB().WithContext(r.Context()))
	if err != nil || ssoconfig.ValidatePublicURL(policy.PublicURL) != nil {
		return false
	}
	if r.Header.Get("Origin") == "" && r.Header.Get("Referer") == "" {
		return false
	}
	for _, raw := range []string{r.Header.Get("Origin"), r.Header.Get("Referer")} {
		if raw == "" {
			continue
		}
		u, err := url.Parse(raw)
		if err != nil || u.Scheme+"://"+u.Host != policy.PublicURL || u.User != nil {
			return false
		}
	}
	return !strings.Contains(r.Header.Get("Origin"), ",") && !bytes.ContainsAny([]byte(r.Header.Get("Origin")), "\r\n")
}
