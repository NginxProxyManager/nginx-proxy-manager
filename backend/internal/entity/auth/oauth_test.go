package auth

import (
	"context"
	"testing"

	"npm/internal/entity/setting"

	cache "github.com/patrickmn/go-cache"
	"github.com/rotisserie/eris"
	"github.com/stretchr/testify/assert"
)

func TestGetOAuth2Config(t *testing.T) {
	tests := []struct {
		name          string
		mockSettings  setting.OAuthSettings
		expectedError error
	}{
		{
			name: "Valid settings",
			mockSettings: setting.OAuthSettings{
				ClientID:     "valid-client-id",
				ClientSecret: "valid-client-secret",
				AuthURL:      "https://auth.url",
				TokenURL:     "https://token.url",
				Scopes:       []string{"scope1", "scope2"},
			},
			expectedError: nil,
		},
		{
			name: "Missing ClientID",
			mockSettings: setting.OAuthSettings{
				ClientSecret: "valid-client-secret",
				AuthURL:      "https://auth.url",
				TokenURL:     "https://token.url",
				Scopes:       []string{"scope1", "scope2"},
			},
			expectedError: eris.New("oauth-settings-incorrect"),
		},
		{
			name: "Missing ClientSecret",
			mockSettings: setting.OAuthSettings{
				ClientID: "valid-client-id",
				AuthURL:  "https://auth.url",
				TokenURL: "https://token.url",
				Scopes:   []string{"scope1", "scope2"},
			},
			expectedError: eris.New("oauth-settings-incorrect"),
		},
		{
			name: "Missing AuthURL",
			mockSettings: setting.OAuthSettings{
				ClientID:     "valid-client-id",
				ClientSecret: "valid-client-secret",
				TokenURL:     "https://token.url",
				Scopes:       []string{"scope1", "scope2"},
			},
			expectedError: eris.New("oauth-settings-incorrect"),
		},
		{
			name: "Missing TokenURL",
			mockSettings: setting.OAuthSettings{
				ClientID:     "valid-client-id",
				ClientSecret: "valid-client-secret",
				AuthURL:      "https://auth.url",
				Scopes:       []string{"scope1", "scope2"},
			},
			expectedError: eris.New("oauth-settings-incorrect"),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Mock the GetOAuthSettings function
			settingGetOAuthSettings = func() (setting.OAuthSettings, error) {
				return tt.mockSettings, nil
			}

			config, settings, err := getOAuth2Config()

			if tt.expectedError != nil {
				assert.Error(t, err)
				assert.Equal(t, tt.expectedError.Error(), err.Error())
			} else {
				assert.NoError(t, err)
				assert.NotNil(t, config)
				assert.NotNil(t, settings)
				assert.Equal(t, tt.mockSettings.ClientID, config.ClientID)
				assert.Equal(t, tt.mockSettings.ClientSecret, config.ClientSecret)
				assert.Equal(t, tt.mockSettings.AuthURL, config.Endpoint.AuthURL)
				assert.Equal(t, tt.mockSettings.TokenURL, config.Endpoint.TokenURL)
				assert.Equal(t, tt.mockSettings.Scopes, config.Scopes)
			}
		})
	}
}

func TestGetEmail(t *testing.T) {
	tests := []struct {
		name      string
		oauthUser OAuthUser
		expected  string
	}{
		{
			name: "Email in resource",
			oauthUser: OAuthUser{
				Resource: map[string]any{
					"email": "user@example.com",
				},
			},
			expected: "user@example.com",
		},
		{
			name: "Identifier is email",
			oauthUser: OAuthUser{
				Identifier: "user@example.com",
			},
			expected: "user@example.com",
		},
		{
			name: "Identifier is not email",
			oauthUser: OAuthUser{
				Identifier: "user123",
			},
			expected: "user123@oauth",
		},
		{
			name: "No email or identifier",
			oauthUser: OAuthUser{
				Resource: map[string]any{},
			},
			expected: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			email := tt.oauthUser.GetEmail()
			assert.Equal(t, tt.expected, email)
		})
	}
}

func TestGetName(t *testing.T) {
	tests := []struct {
		name      string
		oauthUser OAuthUser
		expected  string
	}{
		{
			name: "Nickname in resource",
			oauthUser: OAuthUser{
				Resource: map[string]any{
					"nickname": "user_nick",
				},
			},
			expected: "user_nick",
		},
		{
			name: "Given name in resource",
			oauthUser: OAuthUser{
				Resource: map[string]any{
					"given_name": "User Given",
				},
			},
			expected: "User Given",
		},
		{
			name: "Name in resource",
			oauthUser: OAuthUser{
				Resource: map[string]any{
					"name": "User Name",
				},
			},
			expected: "User Name",
		},
		{
			name: "Preferred username in resource",
			oauthUser: OAuthUser{
				Resource: map[string]any{
					"preferred_username": "preferred_user",
				},
			},
			expected: "preferred_user",
		},
		{
			name: "Username in resource",
			oauthUser: OAuthUser{
				Resource: map[string]any{
					"username": "user123",
				},
			},
			expected: "user123",
		},
		{
			name: "No name fields in resource, fallback to identifier",
			oauthUser: OAuthUser{
				Identifier: "fallback_identifier",
				Resource:   map[string]any{},
			},
			expected: "fallback_identifier",
		},
		{
			name: "No name fields and no identifier",
			oauthUser: OAuthUser{
				Resource: map[string]any{},
			},
			expected: "",
		},
		{
			name: "All fields",
			oauthUser: OAuthUser{
				Identifier: "fallback_identifier",
				Resource: map[string]any{
					"nickname":           "user_nick",
					"given_name":         "User Given",
					"name":               "User Name",
					"preferred_username": "preferred_user",
					"username":           "user123",
				},
			},
			expected: "user_nick",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			name := tt.oauthUser.GetName()
			assert.Equal(t, tt.expected, name)
		})
	}
}

func TestGetID(t *testing.T) {
	tests := []struct {
		name      string
		oauthUser OAuthUser
		expected  string
	}{
		{
			name: "Identifier is set",
			oauthUser: OAuthUser{
				Identifier: "user123",
			},
			expected: "user123",
		},
		{
			name: "UID in resource",
			oauthUser: OAuthUser{
				Resource: map[string]any{
					"uid": "uid123",
				},
			},
			expected: "uid123",
		},
		{
			name: "User ID in resource",
			oauthUser: OAuthUser{
				Resource: map[string]any{
					"user_id": "user_id123",
				},
			},
			expected: "user_id123",
		},
		{
			name: "Username in resource",
			oauthUser: OAuthUser{
				Resource: map[string]any{
					"username": "username123",
				},
			},
			expected: "username123",
		},
		{
			name: "Preferred username in resource",
			oauthUser: OAuthUser{
				Resource: map[string]any{
					"preferred_username": "preferred_user",
				},
			},
			expected: "preferred_user",
		},
		{
			name: "Email in resource",
			oauthUser: OAuthUser{
				Resource: map[string]any{
					"email": "user@example.com",
				},
			},
			expected: "user@example.com",
		},
		{
			name: "Mail in resource",
			oauthUser: OAuthUser{
				Resource: map[string]any{
					"mail": "mail@example.com",
				},
			},
			expected: "mail@example.com",
		},
		{
			name: "No identifier or resource fields",
			oauthUser: OAuthUser{
				Resource: map[string]any{},
			},
			expected: "",
		},
		{
			name: "All fields",
			oauthUser: OAuthUser{
				Identifier: "user123",
				Resource: map[string]any{
					"uid":                "uid123",
					"user_id":            "user_id123",
					"username":           "username123",
					"preferred_username": "preferred_user",
					"mail":               "mail@example.com",
					"email":              "email@example.com",
				},
			},
			expected: "user123",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			id := tt.oauthUser.GetID()
			assert.Equal(t, tt.expected, id)
		})
	}
}

func TestOAuthLogin(t *testing.T) {
	tests := []struct {
		name          string
		redirectBase  string
		ipAddress     string
		expectedError error
	}{
		{
			name:          "Valid redirect base",
			redirectBase:  "https://redirect.base",
			ipAddress:     "127.0.0.1",
			expectedError: nil,
		},
		{
			name:          "Empty redirect base",
			redirectBase:  "",
			ipAddress:     "127.0.0.1",
			expectedError: nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Mock the GetOAuthSettings function
			settingGetOAuthSettings = func() (setting.OAuthSettings, error) {
				return setting.OAuthSettings{
					ClientID:     "valid-client-id",
					ClientSecret: "valid-client-secret",
					AuthURL:      "https://auth.url",
					TokenURL:     "https://token.url",
					Scopes:       []string{"scope1", "scope2"},
				}, nil
			}

			url, err := OAuthLogin(tt.redirectBase, tt.ipAddress)

			if tt.expectedError != nil {
				assert.Error(t, err)
				assert.Equal(t, tt.expectedError.Error(), err.Error())
			} else {
				assert.NoError(t, err)
				assert.NotEmpty(t, url)
			}
		})
	}
}

func TestOAuthReturn(t *testing.T) {
	var errNotFound = eris.New("oauth-verifier-not-found")
	tests := []struct {
		name          string
		code          string
		ipAddress     string
		expectedError error
	}{
		{
			name:          "Invalid code",
			code:          "invalid-code",
			ipAddress:     "127.0.0.100",
			expectedError: errNotFound,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Mock the GetOAuthSettings function
			settingGetOAuthSettings = func() (setting.OAuthSettings, error) {
				return setting.OAuthSettings{
					ClientID:     "valid-client-id",
					ClientSecret: "valid-client-secret",
					AuthURL:      "https://auth.url",
					TokenURL:     "https://token.url",
					Scopes:       []string{"scope1", "scope2"},
					ResourceURL:  "https://resource.url",
					Identifier:   "id",
				}, nil
			}

			// Initialise the cache and set a verifier
			OAuthCacheInit()
			if tt.expectedError != errNotFound {
				OAuthCache.Set(getCacheKey(tt.ipAddress), "valid-verifier", cache.DefaultExpiration)
			}

			ctx := context.Background()
			user, err := OAuthReturn(ctx, tt.code, tt.ipAddress)

			if tt.expectedError != nil {
				assert.Error(t, err)
				assert.Equal(t, tt.expectedError.Error(), err.Error())
			} else {
				assert.NoError(t, err)
				assert.NotNil(t, user)
			}
		})
	}
}
