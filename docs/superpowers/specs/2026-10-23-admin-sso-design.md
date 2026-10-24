# Admin SSO design

Status: Approved by the user on 2026-10-23. Implementation is in progress under the approved implementation plan; release validation remains pending.

## Intent and agreed scope

Add SSO to the Nginx Proxy Manager administration application, configured entirely through the administration UI. Protecting applications behind Proxy Hosts is out of scope.

The user selected a shared SSO layer with separate OIDC, OAuth2 and SAML 2.0 adapters, reusing NPM users and permissions. All three protocols and multiple simultaneously enabled connections are in the first release. This is a substantial authentication feature, including session lifecycle, migrations, administration screens and regression coverage.

Confirmed requirements:

- Preserve bootstrap: create the first local administrator, log in, then configure SSO.
- Support parallel password/SSO login and SSO-only mode.
- Each administrator account has an explicit switch permitting password login, including an exception in SSO-only mode.
- Each connection has an administrator-defined display name and its own login button.
- One shared allowlist of complete email addresses applies to every enabled connection. No domain rules, per-user connection assignments or per-connection allowlists.
- Authenticate with the provider first, then compare its email against the allowlist. Do not require an email-verification claim. Trust in the configured provider is intentional.
- For an allowed email, reuse an existing NPM user directly, preserving ID and permissions; otherwise create a user with a normal internal ID on first successful login.
- Newly created SSO users receive zero capabilities. They can see a waiting-for-permissions page and log out, but cannot read or change application data. Administrators assign permissions using the existing user-management feature.
- Disabled users remain blocked. Never reactivate or grant permissions as a side effect of SSO.
- SSO bypasses NPM 2FA. Password login retains its existing 2FA behavior.
- Logout ends the NPM session only; no provider logout or single logout.
- Removing an email immediately revokes its SSO sessions but does not disable the user or their permitted password login.
- Disabling a connection immediately revokes sessions originating from that connection. Other connections and password sessions remain unaffected.

## Approaches considered

1. Extend the existing generic OAuth flow in place. Reuses its endpoints but requires substantial changes to support connection identity, additional protocols and revocation; leaves protocol-specific logic coupled to shared policy.
2. Introduce a shared SSO service and protocol adapters; reuse user records and capability checks. Selected by the user. More initial work, but one admission/linking/session policy for all protocols and clearer future provider support.

## Current repository findings

- `backend/internal/entity/auth/oauth.go` implements a generic OAuth authorization-code flow with PKCE, manual endpoints and resource-field extraction. Its fixed state, IP-keyed verifier cache and callback handling are unsuitable foundations for the new multi-connection session flow without replacement.
- `backend/internal/api/handler/oauth.go` auto-links by email and issues an application JWT; currently returns that JWT through a URL query parameter.
- `backend/internal/entity/setting/oauth.go` stores one OAuth configuration; initial migrations enable only local authentication.
- `backend/internal/entity/user/model.go` stores users and capability associations. `LoadByEmail` lowercases and trims email. `SaveCapabilities` currently rejects an empty list, which must support the zero-capability SSO lifecycle without granting a default capability.
- `backend/internal/entity/user/capabilities.go` defines `full-admin` and granular view/manage capabilities. `api/middleware/auth.go` enforces requested capabilities against the database.
- JWTs currently identify a user but not a persisted login session or its source. Refresh, SSE token generation and impersonation require review so they cannot strip SSO provenance.
- The React login currently submits local credentials and supports a 2FA challenge UI. Settings currently shows Default Site only.
- Frontend permissions code and user modals still reference legacy `roles`/`permissions`, while backend users expose `capabilities`. Integrating the existing permission UI requires reconciling this contract for the supported capability set; this is necessary work, not a new authorization system.
- A 2FA UI is present; end-to-end backend 2FA behavior must be verified during implementation rather than inferred from that UI.

## Proposed design decisions

The following are implementer proposals, not additional user decisions. They are included for approval with the design.

### Policy and administration

Add Settings > SSO, authorized by `settings.manage` or `full-admin`, with login mode, canonical public administration URL, connection management and a shared email allowlist. User password exceptions require `users.manage` or `full-admin`; only full administrators qualify for the SSO-only password exception.

Default remains parallel mode with existing local behavior unchanged. Existing local administrator accounts start with password login permitted. SSO-created users have no local credential and cannot acquire one through self-service; authorized admins may explicitly provision it under existing user-management rules. In parallel mode existing ordinary local users retain their current behavior. In SSO-only mode only full admins whose password switch is enabled may use passwords.

Keep a discoverable “Administrator password login” entry in SSO-only mode. Its API performs the authoritative per-account check without revealing account existence before authentication. Reject switching to SSO-only without an enabled, structurally valid connection. Do not invent an additional mandatory rescue account or block the user's explicit ability to turn all admin password exceptions off.

Connection editor: immutable internal ID, protocol, display name, enabled flag, protocol settings, generated callback/metadata details, and a test action. Testing reports configuration reachability and validation results; an optional browser handshake proves authentication only, grants no access by itself, and never bypasses the allowlist. Require explicit Save; editing or testing alone cannot enable a connection.

Allowlist editor accepts multiple full addresses, normalizes by trimming/lowercasing consistently with NPM, removes duplicates, and rejects invalid addresses, wildcard/domain entries and ambiguous multi-value identity responses. Empty allowlist denies all SSO logins. Display the provider-trust rule next to email auto-link configuration: any enabled connection can authenticate an allowed email, including an existing administrator email.

### Protocol boundary

Adapters validate protocol messages and produce a common authenticated identity: connection ID, stable provider subject if available, email and optional display name. Shared policy owns allowlist checks, user creation/linking and session issuance. No provider role/group claim grants NPM capabilities.

OIDC: Authorization Code flow with PKCE S256 and discovery from an explicitly configured issuer; client ID/secret, scopes and email/name claim mappings. Validate signature using issuer keys, issuer, audience, expiry, nonce and authorized party as applicable. If UserInfo supplies email, validate that its subject matches the ID token. Require one nonempty email; no synthetic `@oauth` email or username fallback.

OAuth2: Authorization Code flow with PKCE S256; explicit authorization, token and user-info URLs; client credentials, scopes, token-endpoint authentication method and configurable JSON field paths for email/name/subject. Obtain email only from the configured user-info response fetched server-side with the access token. Handle HTTP errors, timeouts and bounded response sizes. This is a provider-specific identity integration using OAuth2, not an assertion that OAuth2 alone standardizes authentication.

SAML 2.0: SP-initiated Web Browser SSO, Redirect AuthnRequest and POST ACS response; configure trusted IdP metadata through URL or pasted XML, IdP signing certificates, SP entity ID and email/name attribute mapping. Expose SP metadata, including ACS URL and SP signing certificate when requests are signed. Configure request-signing in the UI to match IdP metadata/policy; generate and protect the SP key server-side. Only validated signed assertions/responses from configured IdP keys may supply identity. Validate issuer, audience, destination/recipient, request correlation and validity times; reject replay, unsolicited responses and signature-wrapping ambiguity. Initial scope excludes encrypted assertions, IdP-initiated login, artifact binding and SAML logout. Email-format NameID may be selected explicitly as the email source.

Use maintained protocol libraries, not custom JWT/XML signature implementations. Library selection and exact module decomposition belong to the implementation plan, with compatibility and maintenance verified then.

### Login transactions and browser handoff

Use random, single-use, expiring login transactions bound to the initiating browser and connection, never to IP alone. OAuth/OIDC validate state; OIDC also validates nonce. SAML validates request ID and opaque RelayState. Accommodate cross-site SAML POST explicitly: use a short-lived Secure/HttpOnly SameSite=None transaction cookie for that flow, separate from normal cookies. Production callbacks require HTTPS. Local test allowances must be explicit and excluded from production defaults.

Persist transactions and replay records in the database so restarts/multiple instances do not invalidate isolation guarantees. Consume each transaction atomically. Use the configured canonical URL for generated endpoints; do not accept arbitrary `redirect_base` or untrusted forwarded-host headers. Restrict post-login navigation to same-origin application paths.

After validation, recheck enabled connection, current allowlist membership and user status immediately before atomically linking/creating the user and issuing a session. Enforce uniqueness of normalized user email and handle concurrent first logins without duplicate users. Existing account identity and permissions are retained. Persist the email used to authorize the SSO session; profile changes cannot silently change admission identity. Do not automatically rename existing users from provider profile data.

Never put an NPM bearer JWT in a redirect URL. Redirect with a short-lived single-use opaque handoff, bound to the initiating browser, and exchange it server-side for the existing frontend token response. Prevent handoff replay, cache/referrer leakage and unrestricted return URLs. Provider tokens are not frontend credentials and are discarded after identity retrieval unless strictly required by an adapter transaction.

### Sessions and immediate revocation

Introduce database-backed NPM sessions with opaque ID, user ID, authentication source, connection ID/email for SSO, creation/expiry times and revocation status. Application JWTs reference session ID. All new login paths create sessions, including password login, so logout has a server-side effect; SSO admission rules only apply to SSO-origin sessions.

On each protected API request, refresh and SSE handshake, validate the session, user enabled state and, for SSO, current allowlist membership and connection status. Preserve session ID/source in refreshed tokens and derived SSE tokens. Impersonation must retain a link to its originating session and cannot bypass revocation or let a zero-capability user impersonate anyone.

“Immediately” means: after the administration mutation commits, subsequent authorization checks reject affected sessions without waiting for JWT expiry, refresh intervals or cache TTL. An already executing request cannot be undone. Do not serve new protected stream events after revocation; terminate affected open SSE connections. Use a database-backed serialized authorization/revocation check for event delivery or equivalent cross-instance ordering; a periodic poll or a process-local event alone is insufficient for this guarantee. Frontend receives an expiry/revocation event when possible and clears protected cached data; API rejection remains authoritative.

Remove email, disable/delete connection and explicit logout revoke sessions transactionally. Re-adding an email or re-enabling a connection never revives revoked sessions. Sensitive connection changes (issuer, endpoints, client identity, claim mappings or trusted keys) also revoke its sessions and pending transactions; changing display name does not. Refresh cannot detach provenance or resurrect revoked sessions.

Local logout revokes only the current NPM session and its derived tokens, clears client credentials/cache, and leaves the provider session untouched. Ending an impersonation view retains the existing return-to-admin behavior only while the parent session remains valid.

### Permissions and pending users

Zero-capability users may access only minimal authenticated self/session endpoints needed to render their own waiting page, refresh their still-valid session and log out. They cannot change email, password, capabilities or connection settings, list users, read dashboard totals, receive protected events or read proxy/certificate/configuration data.

Audit every authenticated route that currently uses `Enforce()` without capabilities; absence of a capability argument must not imply application-data access for pending users. Ensure the UI consumes backend capabilities and uses the existing permission editor rather than maintaining a second SSO-specific role model. Permission grants apply through the normal backend mechanism and let users leave the waiting page after their profile is refreshed, without creating another account.

## Data, API and migration boundaries

Proposed entities: SSO connections, normalized allowlist entries, login transactions/replay records, browser handoffs, NPM sessions and per-admin password-login policy. Use relational migrations for all supported database engines. Encrypt client secrets/SP keys at rest with a durable installation key; define key creation, backup and restore with the existing deployment conventions. Never return plaintext saved secrets from list/detail/generic settings endpoints. Dedicated write operations support replace/clear and preserve masked unchanged values. No secrets or tokens in audit/error logs.

API families: anonymous enabled-connection discovery; per-connection start/callback/ACS and SP metadata; browser handoff exchange; authorized SSO configuration/allowlist CRUD and test operations; server-side logout. Exact URLs and schemas are implementation-plan choices. Discovery exposes only connection ID, display name and protocol, never credentials, allowlist or private configuration.

Old generic `/oauth` handlers must not remain an alternate route around the new allowlist/session controls. Detect legacy configuration and surface it in the UI for explicit conversion; do not automatically enable it or auto-import all users to the allowlist. Preserve local accounts, IDs and capabilities. Before cutover, audit and repair pre-existing normalized-email duplicates without silently choosing an account.

Because legacy JWTs have no session/source, force one-time reauthentication of existing tokens at rollout. Reject legacy tokens rather than treating an unidentified token as a password session. Document this upgrade effect. Deploy frontend/backend changes together. Downgrade requires database/config backup and is not a transparent rollback.

## Validation and acceptance

Add meaningful backend regression tests and frontend tests following AGENTS.md; use protocol-capable test IdPs/fixtures for each supported adapter and Cypress for integrated administration/login flows.

Required acceptance cases:

1. Existing bootstrap/local login remains available before configuring SSO. Parallel and SSO-only modes enforce per-admin password switches through the backend; password 2FA remains intact and SSO never prompts for NPM 2FA.
2. Multiple OIDC/OAuth2/SAML connections appear with configured labels. Each protocol succeeds with valid fixtures and rejects wrong issuer/audience/signature, expired/replayed messages and wrong transaction/browser binding as applicable.
3. An unlisted email, missing/ambiguous email, disabled connection or disabled user cannot obtain a session. Email casing/whitespace normalize consistently. No domain matching or email-verification-claim requirement is introduced.
4. First allowed login creates exactly one zero-capability user, including concurrent callbacks. Existing email links directly, preserving ID and privileges. Subsequent logins neither add capabilities nor override administrative changes.
5. Pending users cannot read or mutate application data through direct API calls, SSE, refresh-derived tokens or impersonation; permission assignment through the existing UI enables precisely the granted operations.
6. Removing an email rejects all its SSO sessions on the next protected authorization check, including sessions on other instances and derived tokens; password sessions remain valid. Disabling a connection affects only that connection's sessions. Open streams stop protected delivery. Re-enabling/re-adding requires fresh login.
7. Logout rejects reuse of the NPM session/refresh/SSE tokens while provider login remains active. Handoff codes are browser-bound, expire and cannot be reused; no application JWT appears in callback URLs.
8. All configuration is operable in Settings. Unauthorized/pending users cannot access configuration or credentials through dedicated or generic settings APIs. Saved secrets are masked and remain usable after restart/restore with the installation key.
9. Upgrade preserves users and capabilities, requires reauthentication of old JWTs and cannot leave the legacy OAuth route as a bypass.

Run frontend production build, lint and relevant Vitest tests; backend relevant tests and `go test ./...`; integration/Cypress against a running application. Record environment limitations rather than claiming unrun checks passed. Include UI screenshots for review.

## Non-goals and limits

No proxy-host access protection, SCIM, LDAP redesign, provider role/group synchronization, domain allowlisting, per-connection allowlists, provider logout or automatic account deletion. No automatic provider-to-provider identity equivalence beyond the explicitly chosen shared email policy. Initial SAML coverage is the subset stated above, not every SAML profile.

## Standards references

- OpenID Connect Core: https://openid.net/specs/openid-connect-core-1_0.html
- OAuth 2.0 Security Best Current Practice: https://www.rfc-editor.org/rfc/rfc9700.html
- SAML 2.0 specifications (implementation must verify profile/conformance details): https://www.oasis-open.org/standard/saml/

## Approval and next step

User requirements and the proposed design were approved in conversation on 2026-10-23. Next step: produce an implementation plan. Approval to write that plan does not itself request product implementation.
