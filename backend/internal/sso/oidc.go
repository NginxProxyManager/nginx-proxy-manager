package sso

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"net/http"
	"net/url"
	"slices"
	"strings"

	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"

	ssoconfig "npm/internal/entity/sso"
	"npm/internal/secretstore"
)

type OIDCAdapter struct {
	client  *http.Client
	secrets *secretstore.Store
}

// NewOIDCAdapter accepts a fixture client's transport, never its timeout,
// redirect rules, or unlimited response handling.
func NewOIDCAdapter(client *http.Client, secrets *secretstore.Store) Adapter {
	var transport http.RoundTripper
	if client != nil {
		transport = client.Transport
	}
	return &OIDCAdapter{client: boundedProviderClient(transport), secrets: secrets}
}

func (a *OIDCAdapter) config(c ssoconfig.Connection) (ssoconfig.OIDCConfig, string, error) {
	if a == nil || a.secrets == nil || c.Protocol != ssoconfig.OIDC || ssoconfig.ValidateConfig(c.Protocol, c.ConfigJSON) != nil {
		return ssoconfig.OIDCConfig{}, "", ErrDenied
	}
	var config ssoconfig.OIDCConfig
	if json.Unmarshal([]byte(c.ConfigJSON), &config) != nil {
		return config, "", ErrDenied
	}
	plain, err := a.secrets.Unseal(c.SecretCiphertext, "connection:"+c.ID)
	if err != nil {
		return config, "", ErrDenied
	}
	var bundle struct {
		ClientSecret string `json:"client_secret"`
	}
	if json.Unmarshal(plain, &bundle) != nil || bundle.ClientSecret == "" {
		return config, "", ErrDenied
	}
	return config, bundle.ClientSecret, nil
}

func (a *OIDCAdapter) provider(ctx context.Context, config ssoconfig.OIDCConfig) (*oidc.Provider, error) {
	provider, err := oidc.NewProvider(oidc.ClientContext(ctx, a.client), config.IssuerURL)
	if err != nil {
		return nil, ErrDenied
	}
	return provider, nil
}

func oidcOAuthConfig(c ssoconfig.Connection, transaction Transaction, config ssoconfig.OIDCConfig, secret string, provider *oidc.Provider) (*oauth2.Config, error) {
	if ssoconfig.ValidatePublicURL(transaction.PublicURL) != nil || transaction.ConnectionID != "" && transaction.ConnectionID != c.ID {
		return nil, ErrDenied
	}
	endpoint := provider.Endpoint()
	for _, raw := range []string{endpoint.AuthURL, endpoint.TokenURL} {
		u, err := url.Parse(raw)
		if err != nil || u.Scheme != "https" || u.Host == "" || u.User != nil || u.Fragment != "" {
			return nil, ErrDenied
		}
	}
	if config.TokenAuthMethod == "client_secret_post" {
		endpoint.AuthStyle = oauth2.AuthStyleInParams
	} else {
		endpoint.AuthStyle = oauth2.AuthStyleInHeader
	}
	scopes := config.Scopes
	if len(scopes) == 0 {
		scopes = []string{oidc.ScopeOpenID, "email", "profile"}
	}
	if !containsScope(scopes, oidc.ScopeOpenID) {
		scopes = append([]string{oidc.ScopeOpenID}, scopes...)
	}
	return &oauth2.Config{ClientID: config.ClientID, ClientSecret: secret, Endpoint: endpoint, Scopes: scopes, RedirectURL: transaction.PublicURL + "/sso/" + url.PathEscape(c.ID) + "/callback"}, nil
}

func containsScope(scopes []string, expected string) bool {
	return slices.Contains(scopes, expected)
}

func (a *OIDCAdapter) Start(ctx context.Context, c ssoconfig.Connection, transaction Transaction) (StartResult, error) {
	config, secret, err := a.config(c)
	if err != nil || !validOpaque(transaction.State) || transaction.Nonce == "" || transaction.PKCEVerifier == "" {
		return StartResult{}, ErrDenied
	}
	provider, err := a.provider(ctx, config)
	if err != nil {
		return StartResult{}, ErrDenied
	}
	oauth, err := oidcOAuthConfig(c, transaction, config, secret, provider)
	if err != nil {
		return StartResult{}, ErrDenied
	}
	redirect := oauth.AuthCodeURL(transaction.State, oidc.Nonce(transaction.Nonce), oauth2.S256ChallengeOption(transaction.PKCEVerifier))
	return StartResult{RedirectURL: redirect, AttemptID: transaction.ID}, nil
}

func (a *OIDCAdapter) Complete(ctx context.Context, c ssoconfig.Connection, transaction Transaction, request *http.Request) (Identity, error) {
	config, secret, err := a.config(c)
	if err != nil || request == nil || transaction.Nonce == "" || transaction.PKCEVerifier == "" {
		return Identity{}, ErrDenied
	}
	if len(request.URL.Query()["code"]) != 1 || request.URL.Query().Get("code") == "" || request.URL.Query().Get("error") != "" {
		return Identity{}, ErrDenied
	}
	state, err := CallbackState(request)
	if err != nil || subtle.ConstantTimeCompare([]byte(hash(state)), []byte(transaction.StateHash)) != 1 {
		return Identity{}, ErrDenied
	}
	provider, err := a.provider(ctx, config)
	if err != nil {
		return Identity{}, ErrDenied
	}
	oauth, err := oidcOAuthConfig(c, transaction, config, secret, provider)
	if err != nil {
		return Identity{}, ErrDenied
	}
	providerCtx := oidc.ClientContext(ctx, a.client)
	token, err := oauth.Exchange(providerCtx, request.URL.Query().Get("code"), oauth2.VerifierOption(transaction.PKCEVerifier))
	if err != nil {
		return Identity{}, ErrDenied
	}
	raw, ok := token.Extra("id_token").(string)
	if !ok || raw == "" {
		return Identity{}, ErrDenied
	}
	idToken, err := provider.Verifier(&oidc.Config{ClientID: config.ClientID}).Verify(providerCtx, raw)
	if err != nil || idToken.Subject == "" || subtle.ConstantTimeCompare([]byte(idToken.Nonce), []byte(transaction.Nonce)) != 1 {
		return Identity{}, ErrDenied
	}
	var claims map[string]json.RawMessage
	if idToken.Claims(&claims) != nil {
		return Identity{}, ErrDenied
	}
	var azp string
	value, exists := claims["azp"]
	if exists && (json.Unmarshal(value, &azp) != nil || azp == "" || azp != config.ClientID) {
		return Identity{}, ErrDenied
	}
	if len(idToken.Audience) > 1 && !exists {
		return Identity{}, ErrDenied
	}
	if config.UseUserinfo {
		userinfo, err := provider.UserInfo(providerCtx, oauth2.StaticTokenSource(token))
		if err != nil || userinfo.Subject != idToken.Subject || userinfo.Subject == "" {
			return Identity{}, ErrDenied
		}
		claims = nil
		if userinfo.Claims(&claims) != nil {
			return Identity{}, ErrDenied
		}
	}
	email, ok := scalarClaim(claims, config.EmailClaim)
	if !ok {
		return Identity{}, ErrDenied
	}
	name, _ := scalarClaim(claims, config.NameClaim)
	return Identity{Subject: idToken.Subject, Email: email, Name: name}, nil
}

func scalarClaim(claims map[string]json.RawMessage, key string) (string, bool) {
	if key == "" {
		return "", false
	}
	value, exists := claims[key]
	if !exists {
		return "", false
	}
	var scalar string
	if json.Unmarshal(value, &scalar) != nil || strings.TrimSpace(scalar) == "" {
		return "", false
	}
	return scalar, true
}

// Probe performs bounded read-only discovery. Handler registration lives in
// Task 11 so this package never imports the API handler package.
func (a *OIDCAdapter) Probe(ctx context.Context, c ssoconfig.Connection) error {
	config, _, err := a.config(c)
	if err != nil {
		return ErrDenied
	}
	_, err = a.provider(ctx, config)
	if err != nil {
		return ErrDenied
	}
	return nil
}
