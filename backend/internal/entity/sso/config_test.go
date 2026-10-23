package sso

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestCanonicalPublicURL(t *testing.T) {
	for _, value := range []string{"http://npm.example", "https://npm.example/path", "https://npm.example?x=1", "https://npm.example?", "https://npm.example/#fragment", "https://user@npm.example", "https://npm.example/"} {
		require.Error(t, ValidatePublicURL(value), value)
	}
	require.NoError(t, ValidatePublicURL("https://npm.example:8443"))
	require.NoError(t, ValidatePublicURL("https://127.0.0.1"))
}

func TestProtocolConfigRejectsSecretAndMissingEndpoints(t *testing.T) {
	for _, tc := range []struct {
		protocol Protocol
		config   string
	}{
		{OIDC, `{"issuer_url":"https://id.example","client_id":"npm","client_secret":"leak"}`},
		{OIDC, `{"client_id":"npm"}`},
		{OAuth2, `{"authorization_url":"https://id.example/auth","client_id":"npm"}`},
		{SAML, `{"idp_metadata_url":"http://id.example/metadata","sp_entity_id":"npm"}`},
	} {
		require.Error(t, ValidateConfig(tc.protocol, tc.config), tc.config)
	}
	for _, tc := range []struct {
		protocol Protocol
		config   string
	}{
		{OIDC, `{"issuer_url":"https://id.example","client_id":"npm","scopes":["openid","email"],"email_claim":"email","name_claim":"name","use_userinfo":true}`},
		{OAuth2, `{"authorization_url":"https://id.example/auth","token_url":"https://id.example/token","userinfo_url":"https://id.example/user","client_id":"npm","subject_claim":"id","email_claim":"email","token_auth_method":"client_secret_basic"}`},
		{SAML, `{"idp_metadata_url":"https://id.example/metadata","sp_entity_id":"urn:example:npm","email_attribute":"email","name_attribute":"name","sign_requests":false}`},
	} {
		require.NoError(t, ValidateConfig(tc.protocol, tc.config), tc.config)
	}
}

func TestProtocolSpecificMetadataAndAuthFields(t *testing.T) {
	require.NoError(t, ValidateConfig(SAML, `{"idp_metadata_xml":"<EntityDescriptor />","sp_entity_id":"https://npm.example/api/sso/saml","email_name_id":true,"sign_requests":true}`))
	for _, tc := range []struct {
		protocol Protocol
		config   string
	}{
		{OAuth2, `{"authorization_url":"https://id.example/auth","token_url":"https://id.example/token","userinfo_url":"https://id.example/user","client_id":"npm","subject_claim":"id","email_claim":"email","token_auth_method":"none"}`},
		{SAML, `{"idp_metadata_url":"https://id.example/metadata","idp_metadata_xml":"<EntityDescriptor />","sp_entity_id":"https://npm.example/api/sso/saml","email_name_id":true}`},
		{SAML, `{"idp_metadata_xml":"<EntityDescriptor />","sp_entity_id":"https://npm.example/api/sso/saml"}`},
		{SAML, `{"idp_metadata_xml":"<bad />","sp_entity_id":"urn:example:npm","email_name_id":true}`},
		{SAML, `{"idp_metadata_xml":"<!DOCTYPE x><EntityDescriptor />","sp_entity_id":"urn:example:npm","email_name_id":true}`},
	} {
		require.Error(t, ValidateConfig(tc.protocol, tc.config), tc.config)
	}
}
