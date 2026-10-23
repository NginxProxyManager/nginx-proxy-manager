package schema

import (
	"context"
	"testing"

	"npm/internal/api/middleware"

	"github.com/stretchr/testify/require"
)

func TestSSORequestSchemasRejectUnknownAndMalformedFields(t *testing.T) {
	tests := []struct {
		name, schema, payload string
		valid                 bool
	}{
		{"policy valid", SSOPolicy(), `{"revision":1,"mode":"parallel","public_url":"https://npm.example"}`, true},
		{"policy unknown", SSOPolicy(), `{"revision":1,"mode":"parallel","public_url":"https://npm.example","secret":"x"}`, false},
		{"connection valid", SSOConnectionCreate(), `{"protocol":"oidc","name":"Corporate","enabled":false,"config":{"issuer_url":"https://id.example","client_id":"npm","scopes":["openid","email"]},"secret_action":"replace","secret_value":"token"}`, true},
		{"connection unknown credential", SSOConnectionCreate(), `{"protocol":"oidc","name":"Corporate","enabled":false,"config":{"issuer_url":"https://id.example","client_id":"npm","client_secret":"leak"},"secret_action":"keep"}`, false},
		{"connection invalid action", SSOConnectionUpdate(), `{"revision":1,"protocol":"oidc","name":"Corporate","enabled":false,"config":{},"secret_action":"write"}`, false},
		{"allowlist valid empty", SSOAllowlist(), `{"revision":1,"emails":[]}`, true},
		{"allowlist malformed email", SSOAllowlist(), `{"revision":1,"emails":["example.com"]}`, false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			errs, err := middleware.CheckRequestSchema(context.Background(), tc.schema, []byte(tc.payload))
			require.NoError(t, err)
			if tc.valid {
				require.Empty(t, errs)
			} else {
				require.NotEmpty(t, errs)
			}
		})
	}
}
