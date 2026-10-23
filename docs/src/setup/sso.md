---
outline: deep
---

# Administrator single sign-on

Nginx Proxy Manager supports OpenID Connect (OIDC), OAuth 2.0 with a UserInfo endpoint, and SAML 2.0 for the administrator application. SSO does not authenticate visitors to proxy hosts.

## Before enabling SSO

Create the first local full administrator through the normal setup flow. Then open **Settings > Single sign-on**. Keep a tested local administrator credential until every provider has been verified; an SSO-only policy still offers the administrator-password recovery entry only to full administrators whose password-login switch is enabled.

Set **Public URL** to the canonical HTTPS origin used by browsers, for example `https://npm.example.com`. It must not contain a path, query, fragment, credentials, or a non-HTTPS scheme. Configure the provider with the URLs shown by the connection editor:

- OIDC/OAuth2 callback: `https://npm.example.com/sso/<connection-id>/callback`
- SAML assertion consumer service: `https://npm.example.com/sso/<connection-id>/acs`
- SAML service-provider metadata: `https://npm.example.com/sso/<connection-id>/metadata`

Redirects, discovery, token endpoints, UserInfo and metadata must remain HTTPS. NPM validates provider TLS; do not disable certificate validation. If an internal CA is used, install only that CA in the NPM container trust store.

## Trusted email policy

The allowlist is shared by every enabled SSO connection. Enter complete email addresses, one per line. Domains, wildcards and provider-specific assignments are not supported. An empty list denies every SSO login.

The provider-authenticated email is normalized and compared exactly. NPM does not require an `email_verified` claim. A matching existing NPM account is linked directly, preserving its ID, name and capabilities. Otherwise the first successful login creates one account with no capabilities. The user sees **Waiting for access** until an administrator grants existing NPM capabilities in **Users**; retrying or using another enabled provider with the same email reuses that account.

Disabling a user always denies login. An SSO-created account cannot add a password or LDAP credential itself. A full administrator may explicitly provision a local credential; this changes the account's credential origin and is separate from the per-full-admin password-login switch.

## Protocol fields

### OIDC

Provide the issuer URL, client ID and client secret. NPM uses authorization code flow with PKCE, validates issuer, signature, audience, nonce and subject, and can optionally read a scalar email from UserInfo.

### OAuth 2.0

Provide authorization, token and UserInfo URLs, client credentials, token authentication method and the email JSON path. OAuth2 must return a Bearer token and a scalar email; it is not treated as OIDC and no fabricated ID token is accepted.

### SAML 2.0

Load IdP metadata by HTTPS URL or paste metadata XML, never both. Preview metadata and review the entity ID, SSO URL, certificate fingerprints and effective request-signing decision before saving. The preview token is single use. Encrypted assertions, artifact binding and IdP-initiated login are intentionally rejected; use signed SP-initiated HTTP-Redirect requests and HTTP-POST responses.

## Sessions, changes and logout

Removing a trusted email immediately revokes every SSO session for that email. Disabling/removing a connection, changing protocol/security configuration, replacing/clearing a secret, or refreshing SAML trust revokes sessions from that connection. A display-name-only edit preserves them. Re-adding an email or re-enabling a connection never revives an old session or handoff. Authorization is checked from the database at each protected boundary, including stream delivery.

NPM logout revokes the NPM session and descendants only. It does not log the browser out of the identity provider. SSO login bypasses NPM's login challenge; this release does not implement backend password 2FA despite older UI references, so password-2FA enforcement requires a separate release decision.

## Backup and restore

Back up the database and `<DataFolder>/keys/sso.key` together. The key is an independent 32-byte file used to encrypt connection secrets and SAML signing material. A missing or mismatched key makes secret-dependent SSO operations fail with an actionable restore error while local administrator recovery and disabling a connection remain available.

Restoring only the database is not enough. Restore the matching key with restrictive file permissions, restart every NPM instance sharing the database, and test each connection. Secret replacement, SAML metadata refresh and other sensitive edits require users to authenticate again.

## Legacy OAuth migration

Before upgrading an OAuth-only installation, prepare and test a local full-administrator account and ensure local login is enabled. Deploy frontend and backend together. Legacy `/oauth/login` and `/oauth/redirect` endpoints return `410` and never issue tokens; old JWTs without a server session ID are rejected.

The Settings page exposes an explicit legacy import when legacy values exist. Import creates a **disabled** OAuth2 draft with a masked secret and does not populate the shared allowlist. Review URLs, mapping and trust, add exact emails, test, then enable it. The plaintext legacy secret is removed only after the conversion transaction succeeds.
