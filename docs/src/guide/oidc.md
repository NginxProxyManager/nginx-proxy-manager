# OpenID Connect sign-in

Nginx Proxy Manager can use a standard OIDC provider for sign-in. Enable it in
Settings → OpenID Connect using an issuer URL, client ID, client secret and the
public HTTPS URL of the NPM admin interface. Register the displayed callback
(`https://npm.example.com/api/oidc/callback`) as an exact authorization callback.

Use a confidential client with Authorization Code and PKCE S256. The default
scope is `openid`; username, email and group claims are not required. Advanced
options support automatic login and standard token-endpoint authentication
methods (auto, client_secret_basic, client_secret_post).

Sign in locally, open the user menu → OIDC account, and link your existing NPM
account. Linking/unlinking requires the current password and existing NPM 2FA
code if enabled. Identities are bound by issuer + subject, not matching email or
display name. Unknown identities cannot create accounts or gain administrator
privileges. Original user roles and proxy-host ownership are retained.

Configure the identity provider's client access policies separately. NPM still
enforces its local user status, permissions and 2FA. Local password login remains
available at `/?local=1` even when automatic OIDC login is enabled.

The callback validates state, nonce, PKCE, signature, issuer, audience and token
expiry through openid-client. It uses short-lived, one-time, browser-bound
cookies to exchange for an ordinary NPM API token. Neither provider tokens nor
NPM tokens are placed in URLs. Client secrets are encrypted using NPM's existing
persistent key and never returned by settings APIs.

The HTTPS public URL is explicit: untrusted Host/X-Forwarded headers are not used
to choose the callback or token-exchange origin. Requests to cookie-bearing
endpoints must be same-origin JSON requests. Keep normal reverse-proxy forwarding
for /api/oidc; do not place a second interactive login challenge on the callback.

Signing out ends the local UI session, not the identity-provider session. Already
issued NPM API tokens retain NPM's existing expiry/refresh behavior; provider
revocation alone is not immediate local token revocation. Disable the NPM user
to revoke local access immediately. Linking transactions expire after five
minutes, handoffs after one minute; both are discarded on process restart.

Configuration/identity migrations support the same SQLite, MySQL and PostgreSQL
engines as NPM. Back up the database and /data/keys.json together before upgrades.
