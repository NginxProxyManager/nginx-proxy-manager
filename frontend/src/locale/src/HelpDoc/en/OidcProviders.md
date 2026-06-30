## What are OIDC / SSO Providers?

OIDC (OpenID Connect) providers allow your users to sign in using an external identity provider such as Authentik, Keycloak, Authelia, Google, or any service that supports OpenID Connect.

When configured, a "Sign in with …" button appears on the login page for each enabled provider.

### Key Concepts

- **Discovery URL** - The provider's `.well-known/openid-configuration` endpoint. This is used to automatically discover authorization, token, and user-info endpoints.
- **Client ID & Secret** - Credentials issued by your identity provider when you register this application.
- **Callback URL** - The redirect URI you must register with your provider. Both the login callback and account-linking callback are shown on the settings page and inside the provider modal, and can be copied to your clipboard. If an External Base URL is configured, these URLs will use it as the origin instead of the browser's address.
- **Scopes** - The OIDC scopes requested during authentication. Defaults to `openid email profile` which is sufficient for most providers. You can customise this if your provider requires additional or different scopes.
- **Auto-Provision** - When enabled, users who authenticate via this provider are automatically created in Nginx Proxy Manager with a default role.
- **Pushed Authorization Requests (PAR)** - An enhanced security flow where authorization parameters are sent directly to the provider's PAR endpoint before redirecting the user. Enable this if your provider supports or requires PAR.

### External Base URL

The **External Base URL** setting is only needed when Nginx Proxy Manager is running behind a reverse proxy (including behind itself) and the logout redirect uses the wrong protocol or hostname, for example redirecting to `http://` instead of `https://`.

Set this to the public-facing origin of your NPM instance, for example `https://npm.example.com`. No trailing slash, no path: just the scheme and hostname (with optional port).

**When to use it:**
- You are accessing NPM through a reverse proxy that terminates TLS
- After logout, the browser is redirected to `http://` instead of `https://`
- The redirect hostname does not match your public domain

**When to leave it empty:**
- NPM is directly exposed (no reverse proxy in front of it)
- Forward headers (`X-Forwarded-Proto`, `X-Forwarded-Host`) are correctly set by your proxy

**Environment variable:** You can also set this via the `OIDC_EXTERNAL_BASE_URL` environment variable, useful for Docker deployments. When the env var is set, the UI field is read-only.

**Impact on Callback URLs:** When an External Base URL is set, the callback URLs shown in the provider modal and on the settings page will use it as the origin. You must update your identity provider's allowed redirect URIs to match. If you change the External Base URL, update your IdP configuration accordingly.

### Claim Mapping

Claim mapping lets you tell Nginx Proxy Manager which fields in the provider's ID token or user-info response correspond to the user's email, display name, nickname, and avatar. The defaults work for most providers.

