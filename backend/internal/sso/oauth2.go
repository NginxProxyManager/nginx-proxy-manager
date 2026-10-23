package sso

import (
	"bytes"
	"context"
	"crypto/subtle"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strings"

	"golang.org/x/oauth2"

	ssoconfig "npm/internal/entity/sso"
	"npm/internal/secretstore"
)

// OAuth2Adapter obtains identity exclusively from the configured UserInfo URL.
type OAuth2Adapter struct {
	client  *http.Client
	secrets *secretstore.Store
}

// NewOAuth2Adapter keeps only the injected transport, then applies the shared
// provider timeout, body limit, HTTPS requirement and redirect policy.
func NewOAuth2Adapter(client *http.Client, secrets *secretstore.Store) Adapter {
	var transport http.RoundTripper
	if client != nil {
		transport = client.Transport
	}
	return &OAuth2Adapter{client: boundedProviderClient(transport), secrets: secrets}
}

func validClaimPath(path string, required bool) bool {
	if path == "" {
		return !required
	}
	for _, part := range strings.Split(path, ".") {
		if part == "" || strings.TrimSpace(part) != part || strings.ContainsAny(part, "[]\t\r\n") {
			return false
		}
	}
	return true
}

func (a *OAuth2Adapter) config(c ssoconfig.Connection) (ssoconfig.OAuth2Config, string, error) {
	if a == nil || a.secrets == nil || c.Protocol != ssoconfig.OAuth2 || ssoconfig.ValidateConfig(c.Protocol, c.ConfigJSON) != nil {
		return ssoconfig.OAuth2Config{}, "", ErrDenied
	}
	var cfg ssoconfig.OAuth2Config
	if json.Unmarshal([]byte(c.ConfigJSON), &cfg) != nil || !validClaimPath(cfg.EmailClaim, true) || !validClaimPath(cfg.NameClaim, false) || !validClaimPath(cfg.SubjectClaim, false) {
		return cfg, "", ErrDenied
	}
	plain, err := a.secrets.Unseal(c.SecretCiphertext, "connection:"+c.ID)
	if err != nil {
		return cfg, "", ErrDenied
	}
	var bundle struct {
		ClientSecret string `json:"client_secret"`
	}
	if json.Unmarshal(plain, &bundle) != nil || bundle.ClientSecret == "" {
		return cfg, "", ErrDenied
	}
	return cfg, bundle.ClientSecret, nil
}

func oauth2Config(c ssoconfig.Connection, txn Transaction, cfg ssoconfig.OAuth2Config, secret string) (*oauth2.Config, error) {
	if ssoconfig.ValidatePublicURL(txn.PublicURL) != nil || txn.ConnectionID != "" && txn.ConnectionID != c.ID {
		return nil, ErrDenied
	}
	style := oauth2.AuthStyleInHeader
	if cfg.TokenAuthMethod == "client_secret_post" {
		style = oauth2.AuthStyleInParams
	}
	return &oauth2.Config{
		ClientID: cfg.ClientID, ClientSecret: secret,
		Endpoint: oauth2.Endpoint{AuthURL: cfg.AuthorizationURL, TokenURL: cfg.TokenURL, AuthStyle: style},
		Scopes:   cfg.Scopes, RedirectURL: txn.PublicURL + "/sso/" + url.PathEscape(c.ID) + "/callback",
	}, nil
}

func (a *OAuth2Adapter) Start(_ context.Context, c ssoconfig.Connection, txn Transaction) (StartResult, error) {
	cfg, secret, err := a.config(c)
	if err != nil || !validOpaque(txn.State) || txn.PKCEVerifier == "" {
		return StartResult{}, ErrDenied
	}
	oauth, err := oauth2Config(c, txn, cfg, secret)
	if err != nil {
		return StartResult{}, ErrDenied
	}
	return StartResult{RedirectURL: oauth.AuthCodeURL(txn.State, oauth2.S256ChallengeOption(txn.PKCEVerifier)), AttemptID: txn.ID}, nil
}

func (a *OAuth2Adapter) Complete(ctx context.Context, c ssoconfig.Connection, txn Transaction, request *http.Request) (Identity, error) {
	cfg, secret, err := a.config(c)
	if err != nil || request == nil || txn.PKCEVerifier == "" {
		return Identity{}, ErrDenied
	}
	if len(request.URL.Query()["code"]) != 1 || request.URL.Query().Get("code") == "" || request.URL.Query().Get("error") != "" {
		return Identity{}, ErrDenied
	}
	state, err := CallbackState(request)
	if err != nil || subtle.ConstantTimeCompare([]byte(hash(state)), []byte(txn.StateHash)) != 1 {
		return Identity{}, ErrDenied
	}
	oauth, err := oauth2Config(c, txn, cfg, secret)
	if err != nil {
		return Identity{}, ErrDenied
	}
	providerCtx := context.WithValue(ctx, oauth2.HTTPClient, a.client)
	token, err := oauth.Exchange(providerCtx, request.URL.Query().Get("code"), oauth2.VerifierOption(txn.PKCEVerifier))
	if err != nil || token == nil || !token.Valid() || token.TokenType != "Bearer" {
		return Identity{}, ErrDenied
	}
	userinfoReq, err := http.NewRequestWithContext(ctx, http.MethodGet, cfg.UserinfoURL, nil)
	if err != nil {
		return Identity{}, ErrDenied
	}
	userinfoReq.Header.Set("Authorization", "Bearer "+token.AccessToken)
	userinfoReq.Header.Set("Accept", "application/json")
	response, err := a.client.Do(userinfoReq)
	if err != nil {
		return Identity{}, ErrDenied
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return Identity{}, ErrDenied
	}
	body, err := io.ReadAll(response.Body)
	if err != nil {
		return Identity{}, ErrDenied
	}
	var claims map[string]json.RawMessage
	if json.Unmarshal(body, &claims) != nil || claims == nil || !uniqueJSONKeys(body) {
		return Identity{}, ErrDenied
	}
	email, ok := oauth2ScalarPath(claims, cfg.EmailClaim)
	if !ok {
		return Identity{}, ErrDenied
	}
	name, _ := oauth2ScalarPath(claims, cfg.NameClaim)
	subject, _ := oauth2ScalarPath(claims, cfg.SubjectClaim)
	return Identity{Email: email, Name: name, Subject: subject}, nil
}

// JSON's usual last-key-wins behavior would make repeated identity fields
// ambiguous. Reject duplicates at every object level before mapping claims.
func uniqueJSONKeys(body []byte) bool {
	decoder := json.NewDecoder(bytes.NewReader(body))
	if !uniqueJSONValue(decoder, 0) {
		return false
	}
	_, err := decoder.Token()
	return err == io.EOF
}

func uniqueJSONValue(decoder *json.Decoder, depth int) bool {
	if depth > 64 {
		return false
	}
	token, err := decoder.Token()
	if err != nil {
		return false
	}
	start, ok := token.(json.Delim)
	if !ok {
		return true
	}
	switch start {
	case '{':
		seen := make(map[string]bool)
		for decoder.More() {
			keyToken, err := decoder.Token()
			key, isString := keyToken.(string)
			if err != nil || !isString || seen[key] {
				return false
			}
			seen[key] = true
			if !uniqueJSONValue(decoder, depth+1) {
				return false
			}
		}
	case '[':
		for decoder.More() {
			if !uniqueJSONValue(decoder, depth+1) {
				return false
			}
		}
	default:
		return false
	}
	end, err := decoder.Token()
	return err == nil && end == json.Delim(map[json.Delim]json.Delim{'{': '}', '[': ']'}[start])
}

func oauth2ScalarPath(claims map[string]json.RawMessage, path string) (string, bool) {
	if path == "" {
		return "", false
	}
	parts := strings.Split(path, ".")
	value := claims[parts[0]]
	for _, part := range parts[1:] {
		var object map[string]json.RawMessage
		if json.Unmarshal(value, &object) != nil || object == nil {
			return "", false
		}
		value = object[part]
	}
	var scalar string
	if json.Unmarshal(value, &scalar) != nil || strings.TrimSpace(scalar) == "" {
		return "", false
	}
	return scalar, true
}

// Probe checks configured endpoints without credentials or login side effects.
// Authorization-required and method-not-allowed responses prove reachability.
func (a *OAuth2Adapter) Probe(ctx context.Context, c ssoconfig.Connection) error {
	cfg, _, err := a.config(c)
	if err != nil {
		return ErrDenied
	}
	for _, endpoint := range []string{cfg.AuthorizationURL, cfg.TokenURL, cfg.UserinfoURL} {
		req, err := http.NewRequestWithContext(ctx, http.MethodHead, endpoint, nil)
		if err != nil {
			return ErrDenied
		}
		resp, err := a.client.Do(req)
		if err != nil {
			return ErrDenied
		}
		_ = resp.Body.Close()
		if resp.StatusCode < 200 || resp.StatusCode >= 400 && resp.StatusCode != http.StatusUnauthorized && resp.StatusCode != http.StatusForbidden && resp.StatusCode != http.StatusMethodNotAllowed {
			return ErrDenied
		}
	}
	return nil
}
