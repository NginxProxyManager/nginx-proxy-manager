package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"sync"

	h "npm/internal/api/http"
	"npm/internal/entity/sso"
)

// Startup registers the adapter methods without an API/service import cycle.
type SSOSAMLPreview func(context.Context, string) (sso.SAMLMetadataPreview, error)
type SSOSAMLPrepare func(context.Context, *sso.Connection, sso.Connection, string) ([]byte, error)

var ssoSAMLHooks = struct {
	sync.RWMutex
	preview SSOSAMLPreview
	prepare SSOSAMLPrepare
}{}

func RegisterSSOSAML(preview SSOSAMLPreview, prepare SSOSAMLPrepare) {
	ssoSAMLHooks.Lock()
	defer ssoSAMLHooks.Unlock()
	ssoSAMLHooks.preview = preview
	ssoSAMLHooks.prepare = prepare
}
func prepareSSOSAML(ctx context.Context, old *sso.Connection, next sso.Connection, token string) ([]byte, error) {
	ssoSAMLHooks.RLock()
	prepare := ssoSAMLHooks.prepare
	ssoSAMLHooks.RUnlock()
	if prepare == nil {
		return nil, errSSOInvalid
	}
	value, err := prepare(ctx, old, next, token)
	if err != nil || len(value) == 0 {
		return nil, errSSOInvalid
	}
	return value, nil
}
func PreviewSSOSAMLMetadata() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var input struct {
			Config json.RawMessage `json:"config"`
		}
		if decodeSSO(r, &input) != nil || sso.ValidateConfig(sso.SAML, string(input.Config)) != nil {
			ssoError(w, r, errSSOInvalid)
			return
		}
		ssoSAMLHooks.RLock()
		preview := ssoSAMLHooks.preview
		ssoSAMLHooks.RUnlock()
		if preview == nil {
			h.ResultErrorJSON(w, r, http.StatusNotImplemented, "sso_protocol_unavailable", nil)
			return
		}
		value, err := preview(r.Context(), string(input.Config))
		if err != nil {
			ssoError(w, r, errSSOInvalid)
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		h.ResultResponseJSON(w, r, http.StatusOK, value)
	}
}
