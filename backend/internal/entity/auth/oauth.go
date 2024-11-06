package auth

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"strings"
	"time"

	"npm/internal/entity/setting"
	"npm/internal/logger"

	cache "github.com/patrickmn/go-cache"
	"github.com/rotisserie/eris"
	"golang.org/x/oauth2"
)

// AuthCache is a cache item that stores the Admin API data for each admin that has been requesting endpoints
var OAuthCache *cache.Cache

// OAuthCacheInit will create a new Memory Cache
func OAuthCacheInit() {
	if OAuthCache == nil {
		logger.Debug("Creating a new OAuthCache")
		OAuthCache = cache.New(5*time.Minute, 5*time.Minute)
	}
}

// OAuthUser is the OAuth User
type OAuthUser struct {
	Identifier string                 `json:"identifier"`
	Token      string                 `json:"token"`
	Resource   map[string]interface{} `json:"resource"`
}

// GetEmail will return an email address even if it can't be known in the
// Resource
func (m *OAuthUser) GetResourceField(field string) string {
	if m.Resource != nil {
		if value, ok := m.Resource[field]; ok {
			return value.(string)
		}
	}
	return ""
}

// GetEmail will return an email address even if it can't be known in the
// Resource
func (m *OAuthUser) GetID() string {
	if m.Identifier != "" {
		return m.Identifier
	}

	fields := []string{
		"uid",
		"user_id",
		"username",
		"preferred_username",
		"email",
		"mail",
	}

	for _, field := range fields {
		if val := m.GetResourceField(field); val != "" {
			return val
		}
	}

	return ""
}

// GetName attempts to get a name from the resource
// using different fields
func (m *OAuthUser) GetName() string {
	fields := []string{
		"nickname",
		"given_name",
		"name",
		"preferred_username",
		"username",
	}

	for _, field := range fields {
		if name := m.GetResourceField(field); name != "" {
			return name
		}
	}

	// Fallback:
	return m.Identifier
}

// GetEmail will return an email address even if it can't be known in the
// Resource
func (m *OAuthUser) GetEmail() string {
	// See if there's an email field first
	if email := m.GetResourceField("email"); email != "" {
		return email
	}

	// Return the identifier if it looks like an email
	if m.Identifier != "" {
		if strings.Contains(m.Identifier, "@") {
			return m.Identifier
		}
		return fmt.Sprintf("%s@oauth", m.Identifier)
	}
	return ""
}

func getOAuth2Config() (*oauth2.Config, *setting.OAuthSettings, error) {
	oauthSettings, err := setting.GetOAuthSettings()
	if err != nil {
		return nil, nil, err
	}

	if oauthSettings.ClientID == "" || oauthSettings.ClientSecret == "" || oauthSettings.AuthURL == "" || oauthSettings.TokenURL == "" {
		return nil, nil, eris.New("oauth-settings-incorrect")
	}

	return &oauth2.Config{
		ClientID:     oauthSettings.ClientID,
		ClientSecret: oauthSettings.ClientSecret,
		Scopes:       oauthSettings.Scopes,
		Endpoint: oauth2.Endpoint{
			AuthURL:  oauthSettings.AuthURL,
			TokenURL: oauthSettings.TokenURL,
		},
	}, &oauthSettings, nil
}

// OAuthLogin ...
func OAuthLogin(redirectBase, ipAddress string) (string, error) {
	OAuthCacheInit()

	conf, _, err := getOAuth2Config()
	if err != nil {
		return "", err
	}

	verifier := oauth2.GenerateVerifier()
	OAuthCache.Set(getCacheKey(ipAddress), verifier, cache.DefaultExpiration)

	// todo: state should be unique to the incoming IP address of the requester, I guess
	url := conf.AuthCodeURL("state", oauth2.AccessTypeOnline, oauth2.S256ChallengeOption(verifier))

	if redirectBase != "" {
		url = url + "&redirect_uri=" + redirectBase + "/oauth/redirect"
	}

	logger.Debug("URL: %s", url)
	return url, nil
}

// OAuthReturn ...
func OAuthReturn(ctx context.Context, code, ipAddress string) (*OAuthUser, error) {
	// Just in case...
	OAuthCacheInit()

	conf, oauthSettings, err := getOAuth2Config()
	if err != nil {
		return nil, err
	}

	verifier, found := OAuthCache.Get(getCacheKey(ipAddress))
	if !found {
		return nil, eris.New("oauth-verifier-not-found")
	}

	// Use the authorization code that is pushed to the redirect
	// URL. Exchange will do the handshake to retrieve the
	// initial access token. The HTTP Client returned by
	// conf.Client will refresh the token as necessary.
	tok, err := conf.Exchange(ctx, code, oauth2.VerifierOption(verifier.(string)))
	if err != nil {
		return nil, err
	}

	// At this stage, the token is the JWT as given by the oauth server.
	// we need to use that to get more info about this user,
	// and then we'll create our own jwt for use later.

	client := conf.Client(ctx, tok)
	resp, err := client.Get(oauthSettings.ResourceURL)
	if err != nil {
		return nil, err
	}

	// nolint: errcheck, gosec
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	ou := OAuthUser{
		Token: tok.AccessToken,
	}

	// unmarshal the body into a interface
	if err := json.Unmarshal(body, &ou.Resource); err != nil {
		return nil, err
	}

	// Attempt to get the identifier from the resource
	if oauthSettings.Identifier != "" {
		ou.Identifier = ou.GetResourceField(oauthSettings.Identifier)
	}

	return &ou, nil
}

func getCacheKey(ipAddress string) string {
	return fmt.Sprintf("oauth-%s", ipAddress)
}
