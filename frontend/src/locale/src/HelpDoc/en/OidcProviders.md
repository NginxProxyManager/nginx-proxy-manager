## What are OIDC / SSO Providers?

OIDC (OpenID Connect) providers allow your users to sign in using an external identity provider such as Authentik, Keycloak, Authelia, Google, or any service that supports OpenID Connect.

When configured, a "Sign in with …" button appears on the login page for each enabled provider.

### Key Concepts

- **Discovery URL** - The provider's `.well-known/openid-configuration` endpoint. This is used to automatically discover authorization, token, and user-info endpoints.
- **Client ID & Secret** - Credentials issued by your identity provider when you register this application.
- **Callback URL** - The redirect URI you must register with your provider. It is shown on the settings page and can be copied to your clipboard.
- **Scopes** - The OIDC scopes requested during authentication. Defaults to `openid email profile` which is sufficient for most providers. You can customise this if your provider requires additional or different scopes.
- **Auto-Provision** - When enabled, users who authenticate via this provider are automatically created in Nginx Proxy Manager with a default role.
- **Pushed Authorization Requests (PAR)** - An enhanced security flow where authorization parameters are sent directly to the provider's PAR endpoint before redirecting the user. Enable this if your provider supports or requires PAR.

### Claim Mapping

Claim mapping lets you tell Nginx Proxy Manager which fields in the provider's ID token or user-info response correspond to the user's email, display name, nickname, and avatar. The defaults work for most providers.
