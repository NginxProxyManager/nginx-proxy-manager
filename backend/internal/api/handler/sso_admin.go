package handler

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"reflect"
	"slices"
	"strings"
	"sync"
	"time"

	c "npm/internal/api/context"
	h "npm/internal/api/http"
	"npm/internal/authpolicy"
	"npm/internal/config"
	"npm/internal/database"
	"npm/internal/entity/session"
	"npm/internal/entity/sso"
	"npm/internal/secretstore"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
)

var errSSORevision = errors.New("sso_revision_conflict")
var errSSOInvalid = errors.New("sso_invalid_configuration")
var errSSOKey = errors.New("sso_key_restore_required")

// SSOProbe performs only bounded, read-only provider discovery or metadata
// checks. Protocol packages attach their probes as they become available.
type SSOProbe func(context.Context, sso.Connection) error

var ssoProbes = struct {
	sync.RWMutex
	entries map[sso.Protocol]SSOProbe
}{entries: map[sso.Protocol]SSOProbe{}}

func RegisterSSOProbe(protocol sso.Protocol, probe SSOProbe) {
	ssoProbes.Lock()
	defer ssoProbes.Unlock()
	if probe == nil {
		delete(ssoProbes.entries, protocol)
	} else {
		ssoProbes.entries[protocol] = probe
	}
}

type ssoPolicyInput struct {
	Revision  uint64        `json:"revision"`
	Mode      sso.LoginMode `json:"mode"`
	PublicURL string        `json:"public_url"`
}
type ssoConnectionInput struct {
	Revision        uint64          `json:"revision"`
	Protocol        sso.Protocol    `json:"protocol"`
	Name            string          `json:"name"`
	Enabled         bool            `json:"enabled"`
	Config          json.RawMessage `json:"config"`
	SecretAction    string          `json:"secret_action"`
	SecretValue     string          `json:"secret_value"`
	SAMLImportToken string          `json:"saml_import_token"`
}
type ssoAllowlistInput struct {
	Revision uint64   `json:"revision"`
	Emails   []string `json:"emails"`
}
type ssoRevisionInput struct {
	Revision uint64 `json:"revision"`
}
type ssoConnectionView struct {
	ID        string          `json:"id"`
	Protocol  sso.Protocol    `json:"protocol"`
	Name      string          `json:"name"`
	Enabled   bool            `json:"enabled"`
	Revision  uint64          `json:"revision"`
	Config    json.RawMessage `json:"config"`
	HasSecret bool            `json:"has_secret"`
}

func decodeSSO(r *http.Request, value any) error {
	body, _ := r.Context().Value(c.BodyCtxKey).([]byte)
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(value); err != nil {
		return err
	}
	if decoder.Decode(new(any)) != io.EOF {
		return errSSOInvalid
	}
	return nil
}

func ssoError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, errSSORevision):
		h.ResultErrorJSON(w, r, http.StatusConflict, "sso_revision_conflict", nil)
	case errors.Is(err, gorm.ErrRecordNotFound):
		h.NotFound(w, r)
	case errors.Is(err, errSSOInvalid):
		h.ResultErrorJSON(w, r, http.StatusBadRequest, "sso_invalid_configuration", nil)
	case errors.Is(err, errSSOKey):
		h.ResultErrorJSON(w, r, http.StatusServiceUnavailable, "sso_key_restore_required", nil)
	default:
		h.ResultErrorJSON(w, r, http.StatusServiceUnavailable, "sso_configuration_unavailable", nil)
	}
}

func secretKey() (*secretstore.Store, error) {
	store, err := secretstore.Open(config.Configuration.DataFolder)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", errSSOKey, err)
	}
	return store, nil
}

func sealClientSecret(key *secretstore.Store, id, value string) ([]byte, error) {
	bundle, err := json.Marshal(struct {
		ClientSecret string `json:"client_secret"`
	}{ClientSecret: value})
	if err != nil {
		return nil, err
	}
	return key.Seal(bundle, "connection:"+id)
}

func connectionView(value sso.Connection) ssoConnectionView {
	config := json.RawMessage(`{}`)
	if sso.ValidateConfig(value.Protocol, value.ConfigJSON) == nil {
		config = json.RawMessage(value.ConfigJSON)
	}
	return ssoConnectionView{ID: value.ID, Protocol: value.Protocol, Name: value.Name, Enabled: value.Enabled, Revision: value.Revision, Config: config, HasSecret: len(value.SecretCiphertext) > 0}
}

func sameSSOConfig(protocol sso.Protocol, oldJSON, newJSON string) bool {
	if sso.ValidateConfig(protocol, oldJSON) != nil {
		return false
	}
	var oldValue, newValue any
	if json.Unmarshal([]byte(oldJSON), &oldValue) != nil || json.Unmarshal([]byte(newJSON), &newValue) != nil {
		return false
	}
	return reflect.DeepEqual(oldValue, newValue)
}

func validConnectionInput(input ssoConnectionInput, creating bool) error {
	if input.Protocol != sso.OIDC && input.Protocol != sso.OAuth2 && input.Protocol != sso.SAML {
		return errSSOInvalid
	}
	if strings.TrimSpace(input.Name) != input.Name || input.Name == "" || len(input.Name) > 191 {
		return errSSOInvalid
	}
	if err := sso.ValidateConfig(input.Protocol, string(input.Config)); err != nil {
		return errSSOInvalid
	}
	if input.SecretAction != "keep" && input.SecretAction != "replace" && input.SecretAction != "clear" {
		return errSSOInvalid
	}
	if input.Protocol == sso.SAML && input.SecretAction == "replace" {
		return errSSOInvalid
	}
	if len(input.SAMLImportToken) > 512<<10 || (input.Protocol != sso.SAML && input.SAMLImportToken != "") || (input.Protocol == sso.SAML && !creating && input.SecretAction != "keep") {
		return errSSOInvalid
	}
	if creating && input.SecretAction == "keep" {
		return errSSOInvalid
	}
	if (input.SecretAction == "replace") != (input.SecretValue != "") {
		return errSSOInvalid
	}
	if input.Enabled && (input.Protocol == sso.OIDC || input.Protocol == sso.OAuth2) && input.SecretAction == "clear" {
		return errSSOInvalid
	}
	return nil
}

func newSSOID() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func invalidateSSO(tx *gorm.DB, connectionID, email string, now time.Time) error {
	for _, table := range []string{"sso_transaction", "sso_handoff"} {
		query := tx.Table(table)
		if connectionID != "" {
			query = query.Where("connection_id = ?", connectionID)
		} else if table == "sso_handoff" {
			query = query.Where("login_email = ?", email)
		} else {
			continue
		}
		if err := query.Delete(nil).Error; err != nil {
			return err
		}
	}
	if connectionID != "" {
		return session.RevokeMatching(tx, session.RevocationFilter{ConnectionID: connectionID}, now)
	}
	return session.RevokeMatching(tx, session.RevocationFilter{LoginEmail: email}, now)
}

func invalidateAllSSO(tx *gorm.DB, now time.Time) error {
	if err := tx.Table("sso_transaction").Where("1 = 1").Delete(nil).Error; err != nil {
		return err
	}
	if err := tx.Table("sso_handoff").Where("1 = 1").Delete(nil).Error; err != nil {
		return err
	}
	var ids []string
	if err := tx.Model(&sso.Connection{}).Pluck("id", &ids).Error; err != nil {
		return err
	}
	for _, id := range ids {
		if err := invalidateSSO(tx, id, "", now); err != nil {
			return err
		}
	}
	return nil
}

func enabledValidConnection(tx *gorm.DB, excludeID string) (bool, error) {
	var enabled []sso.Connection
	query := tx.Where("enabled = ?", true)
	if excludeID != "" {
		query = query.Where("id <> ?", excludeID)
	}
	if err := query.Find(&enabled).Error; err != nil {
		return false, err
	}
	for _, connection := range enabled {
		if sso.ValidateConfig(connection.Protocol, connection.ConfigJSON) == nil && len(connection.SecretCiphertext) > 0 {
			return true, nil
		}
	}
	return false, nil
}

func auditSSO(tx *gorm.DB, r *http.Request, event, id string, revision uint64) error {
	actor, _ := r.Context().Value(c.UserIDCtxKey).(uint)
	metadata, _ := json.Marshal(map[string]any{"id": id, "revision": revision})
	now := time.Now().UTC().UnixMilli()
	return tx.Table("audit_log").Create(map[string]any{
		"created_at": now, "updated_at": now, "is_deleted": 0, "user_id": actor,
		"object_type": "sso", "object_id": 0, "action": event, "meta": string(metadata),
	}).Error
}

func GetSSOPolicy() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		value, err := sso.GetPolicy(database.GetDB())
		if err != nil {
			ssoError(w, r, err)
			return
		}
		h.ResultResponseJSON(w, r, http.StatusOK, value)
	}
}

func UpdateSSOPolicy() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var input ssoPolicyInput
		if decodeSSO(r, &input) != nil || input.Revision == 0 || (input.Mode != sso.Parallel && input.Mode != sso.SSOOnly) || (input.PublicURL != "" && sso.ValidatePublicURL(input.PublicURL) != nil) {
			ssoError(w, r, errSSOInvalid)
			return
		}
		var out sso.Policy
		err := sso.WithPolicyWrite(r.Context(), func(tx *gorm.DB) error {
			old, err := sso.GetPolicy(tx)
			if err != nil {
				return err
			}
			if old.Revision != input.Revision {
				return errSSORevision
			}
			if input.Mode == sso.SSOOnly {
				if input.PublicURL == "" {
					return errSSOInvalid
				}
				valid, err := enabledValidConnection(tx, "")
				if err != nil {
					return err
				}
				if !valid {
					return errSSOInvalid
				}
			}
			out = old
			out.Mode = input.Mode
			out.PublicURL = input.PublicURL
			out.Revision++
			if err := tx.Save(&out).Error; err != nil {
				return err
			}
			if old.PublicURL != out.PublicURL {
				if err := invalidateAllSSO(tx, time.Now().UTC()); err != nil {
					return err
				}
			}
			return auditSSO(tx, r, "policy_update", "policy", out.Revision)
		})
		if err != nil {
			ssoError(w, r, err)
			return
		}
		h.ResultResponseJSON(w, r, http.StatusOK, out)
	}
}

func GetSSOConnections() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var rows []sso.Connection
		if err := database.GetDB().Order("name,id").Find(&rows).Error; err != nil {
			ssoError(w, r, err)
			return
		}
		views := make([]ssoConnectionView, 0, len(rows))
		for _, row := range rows {
			views = append(views, connectionView(row))
		}
		h.ResultResponseJSON(w, r, http.StatusOK, views)
	}
}

func GetSSOConnection() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		value, err := sso.GetConnection(database.GetDB(), chi.URLParam(r, "id"))
		if err != nil {
			ssoError(w, r, err)
			return
		}
		h.ResultResponseJSON(w, r, http.StatusOK, connectionView(value))
	}
}

func CreateSSOConnection() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var input ssoConnectionInput
		if decodeSSO(r, &input) != nil || validConnectionInput(input, true) != nil || input.Revision != 0 {
			ssoError(w, r, errSSOInvalid)
			return
		}
		key, err := secretKey()
		if err != nil {
			ssoError(w, r, err)
			return
		}
		id, err := newSSOID()
		if err != nil {
			ssoError(w, r, err)
			return
		}
		value := sso.Connection{ID: id, Protocol: input.Protocol, Name: input.Name, Enabled: input.Enabled, Revision: 1, ConfigJSON: string(input.Config)}
		if value.Protocol == sso.SAML {
			value.SecretCiphertext, err = prepareSSOSAML(r.Context(), nil, value, input.SAMLImportToken)
			if err != nil {
				ssoError(w, r, err)
				return
			}
		}
		if input.SecretAction == "replace" {
			value.SecretCiphertext, err = sealClientSecret(key, id, input.SecretValue)
			if err != nil {
				ssoError(w, r, err)
				return
			}
		}
		if value.Enabled && len(value.SecretCiphertext) == 0 && value.Protocol != sso.SAML {
			ssoError(w, r, errSSOInvalid)
			return
		}
		err = sso.WithPolicyWrite(r.Context(), func(tx *gorm.DB) error {
			if value.Enabled {
				policy, err := sso.GetPolicy(tx)
				if err != nil {
					return err
				}
				if sso.ValidatePublicURL(policy.PublicURL) != nil {
					return errSSOInvalid
				}
			}
			if err := tx.Create(&value).Error; err != nil {
				return err
			}
			return auditSSO(tx, r, "connection_create", id, 1)
		})
		if err != nil {
			ssoError(w, r, err)
			return
		}
		h.ResultResponseJSON(w, r, http.StatusOK, connectionView(value))
	}
}

func UpdateSSOConnection() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var input ssoConnectionInput
		if decodeSSO(r, &input) != nil || input.Revision == 0 || validConnectionInput(input, false) != nil {
			ssoError(w, r, errSSOInvalid)
			return
		}
		id := chi.URLParam(r, "id")
		var value sso.Connection
		err := sso.WithPolicyWrite(r.Context(), func(tx *gorm.DB) error {
			old, err := sso.GetConnection(tx, id)
			if err != nil {
				return err
			}
			if old.Revision != input.Revision {
				return errSSORevision
			}
			if old.Protocol != input.Protocol && input.SecretAction == "keep" && len(old.SecretCiphertext) > 0 && !(input.Protocol == sso.SAML && input.SAMLImportToken != "") {
				return errSSOInvalid
			}
			value = old
			value.Protocol = input.Protocol
			value.Name = input.Name
			value.Enabled = input.Enabled
			value.ConfigJSON = string(input.Config)
			value.Revision++
			// Keeping opaque ciphertext must not require a working installation
			// key. In particular, loss of that key must not block revocation.
			var key *secretstore.Store
			if input.SecretAction == "replace" || input.SAMLImportToken != "" || (!old.Enabled && value.Enabled) {
				key, err = secretKey()
				if err != nil {
					return err
				}
			}
			if value.Protocol == sso.SAML {
				value.SecretCiphertext, err = prepareSSOSAML(r.Context(), &old, value, input.SAMLImportToken)
				if err != nil {
					return err
				}
			}
			switch input.SecretAction {
			case "replace":
				value.SecretCiphertext, err = sealClientSecret(key, id, input.SecretValue)
				if err != nil {
					return err
				}
			case "clear":
				value.SecretCiphertext = nil
			}
			if !old.Enabled && value.Enabled {
				if _, err := key.Unseal(value.SecretCiphertext, "connection:"+id); err != nil {
					return errSSOKey
				}
			}
			if value.Enabled && len(value.SecretCiphertext) == 0 && value.Protocol != sso.SAML {
				return errSSOInvalid
			}
			policy, err := sso.GetPolicy(tx)
			if err != nil {
				return err
			}
			if value.Enabled && sso.ValidatePublicURL(policy.PublicURL) != nil {
				return errSSOInvalid
			}
			if policy.Mode == sso.SSOOnly && old.Enabled && !value.Enabled {
				valid, err := enabledValidConnection(tx, id)
				if err != nil {
					return err
				}
				if !valid {
					return errSSOInvalid
				}
			}
			if err := tx.Save(&value).Error; err != nil {
				return err
			}
			if old.Protocol != value.Protocol || old.Enabled != value.Enabled || !sameSSOConfig(value.Protocol, old.ConfigJSON, value.ConfigJSON) || input.SecretAction != "keep" || input.SAMLImportToken != "" {
				if err := invalidateSSO(tx, id, "", time.Now().UTC()); err != nil {
					return err
				}
				return auditSSO(tx, r, "connection_update", id, value.Revision)
			}
			for _, table := range []string{"sso_transaction", "sso_handoff"} {
				if err := tx.Table(table).Where("connection_id = ? AND connection_revision = ?", id, old.Revision).Update("connection_revision", value.Revision).Error; err != nil {
					return err
				}
			}
			return auditSSO(tx, r, "connection_update", id, value.Revision)
		})
		if err != nil {
			ssoError(w, r, err)
			return
		}
		h.ResultResponseJSON(w, r, http.StatusOK, connectionView(value))
	}
}

func DeleteSSOConnection() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var input ssoRevisionInput
		if decodeSSO(r, &input) != nil || input.Revision == 0 {
			ssoError(w, r, errSSOInvalid)
			return
		}
		id := chi.URLParam(r, "id")
		err := sso.WithPolicyWrite(r.Context(), func(tx *gorm.DB) error {
			value, err := sso.GetConnection(tx, id)
			if err != nil {
				return err
			}
			if value.Revision != input.Revision {
				return errSSORevision
			}
			policy, err := sso.GetPolicy(tx)
			if err != nil {
				return err
			}
			if policy.Mode == sso.SSOOnly && value.Enabled {
				valid, err := enabledValidConnection(tx, id)
				if err != nil {
					return err
				}
				if !valid {
					return errSSOInvalid
				}
			}
			if err := invalidateSSO(tx, id, "", time.Now().UTC()); err != nil {
				return err
			}
			if err := tx.Delete(&value).Error; err != nil {
				return err
			}
			return auditSSO(tx, r, "connection_delete", id, input.Revision)
		})
		if err != nil {
			ssoError(w, r, err)
			return
		}
		h.ResultResponseJSON(w, r, http.StatusOK, map[string]bool{"deleted": true})
	}
}

func GetSSOAllowlist() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var emails []string
		var revision uint64
		// The revision and list are one optimistic-concurrency snapshot. Share
		// the mutation fence so READ COMMITTED cannot mix two policy versions.
		err := authpolicy.WithWrite(r.Context(), func(tx *gorm.DB) error {
			policy, err := sso.GetPolicy(tx)
			if err != nil {
				return err
			}
			revision = policy.Revision
			return tx.Model(&sso.AllowlistEntry{}).Order("email").Pluck("email", &emails).Error
		})
		if err != nil {
			ssoError(w, r, err)
			return
		}
		h.ResultResponseJSON(w, r, http.StatusOK, map[string]any{"revision": revision, "emails": emails})
	}
}

func UpdateSSOAllowlist() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var input ssoAllowlistInput
		if decodeSSO(r, &input) != nil || input.Revision == 0 || input.Emails == nil {
			ssoError(w, r, errSSOInvalid)
			return
		}
		normalized := map[string]bool{}
		for _, raw := range input.Emails {
			email, err := sso.NormalizeEmail(raw)
			if err != nil || normalized[email] {
				ssoError(w, r, errSSOInvalid)
				return
			}
			normalized[email] = true
		}
		var revision uint64
		err := sso.WithPolicyWrite(r.Context(), func(tx *gorm.DB) error {
			policy, err := sso.GetPolicy(tx)
			if err != nil {
				return err
			}
			if policy.Revision != input.Revision {
				return errSSORevision
			}
			var current []string
			if err := tx.Model(&sso.AllowlistEntry{}).Pluck("email", &current).Error; err != nil {
				return err
			}
			for _, email := range current {
				if !normalized[email] {
					if err := invalidateSSO(tx, "", email, time.Now().UTC()); err != nil {
						return err
					}
					if err := tx.Delete(&sso.AllowlistEntry{}, "email = ?", email).Error; err != nil {
						return err
					}
				}
			}
			for email := range normalized {
				var exists int64
				if err := tx.Model(&sso.AllowlistEntry{}).Where("email = ?", email).Count(&exists).Error; err != nil {
					return err
				}
				if exists == 0 {
					if err := tx.Create(&sso.AllowlistEntry{Email: email}).Error; err != nil {
						return err
					}
				}
			}
			// Removal and re-addition cannot revive a prior handoff.
			if err := tx.Table("sso_transaction").Where("1 = 1").Delete(nil).Error; err != nil {
				return err
			}
			if err := tx.Table("sso_handoff").Where("1 = 1").Delete(nil).Error; err != nil {
				return err
			}
			policy.Revision++
			revision = policy.Revision
			if err := tx.Save(&policy).Error; err != nil {
				return err
			}
			return auditSSO(tx, r, "allowlist_update", "allowlist", revision)
		})
		if err != nil {
			ssoError(w, r, err)
			return
		}
		h.ResultResponseJSON(w, r, http.StatusOK, map[string]any{"revision": revision, "emails": sortedEmails(normalized)})
	}
}

func sortedEmails(values map[string]bool) []string {
	out := make([]string, 0, len(values))
	for email := range values {
		out = append(out, email)
	}
	slices.Sort(out)
	return out
}

func TestSSOConnection() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		value, err := sso.GetConnection(database.GetDB(), chi.URLParam(r, "id"))
		if err != nil {
			ssoError(w, r, err)
			return
		}
		if err := sso.ValidateConfig(value.Protocol, value.ConfigJSON); err != nil {
			ssoError(w, r, errSSOInvalid)
			return
		}
		ssoProbes.RLock()
		probe := ssoProbes.entries[value.Protocol]
		ssoProbes.RUnlock()
		if probe == nil {
			h.ResultErrorJSON(w, r, http.StatusNotImplemented, fmt.Sprintf("sso_%s_probe_not_ready", value.Protocol), nil)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()
		if err := probe(ctx, value); err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadGateway, "sso_probe_failed", nil)
			return
		}
		h.ResultResponseJSON(w, r, http.StatusOK, map[string]bool{"ready": true})
	}
}
