# Task 4 report

Status: implemented and locally verified. No deployment.

## Changes

- Protected API and SSE JWTs now require a valid `sid`, matching user ID and correct `api` or `sse` purpose. Middleware reloads session, enabled account, current capabilities, SSO connection and allowlist through the policy fence on every request. The old capability cache is no longer used. Pending sessions have access only to own profile, refresh and logout; own profile always includes `"capabilities":[]` when empty. Own profile and credential changes are denied for pending accounts, and SSO-origin accounts cannot create their own password.
- Local and LDAP credential success creates a fenced persistent session before issuing a JWT. In SSO-only mode, password alternatives require an existing full administrator with `admin_password_enabled`; rejection uses the generic login error after credential validation. Bootstrap first-local-admin behavior remains. The legacy OAuth endpoints return 410 until the browser-bound SSO adapters replace them in Task 11; no sessionless OAuth token is issued.
- Refresh validates and extends the same live session under the policy fence, retaining ID, source, connection, login email and parent. JWT expiry is capped by session expiry; SSE tokens are capped at 60 seconds. Logout revokes the session and descendants. The existing frontend impersonation route now creates a child session only for current `users.manage` or full-admin actors and nonpending targets. Each impersonation ancestor must retain that management grant, so permission removal invalidates already-issued child tokens.
- `/config` requires settings management; version check and ordinary protected routes reject pending users. Debug deletion and test notification require a live full-admin session. These routes do not bypass authorization in debug mode.

## Tests

- TDD RED observed: `go test ./internal/api/... ./internal/jwt` failed because `GenerateForSession` was absent. Parent grant removal regression failed with an authorized child, own pending profile test failed because `capabilities` was omitted, and SSO-origin self-password test returned 400 instead of 403. Each passed after its change.
- HTTP middleware tests cover missing `sid`, API/SSE purpose mismatch, pending resource denial, fresh grant and removal, and revocation. Handler HTTP tests cover logout invalidating the old JWT, expired refresh denial, pending profile shape, pending self/credential mutation denial, SSO-origin self-password denial, SSO-only password-session denial and pending impersonation denial. Session tests cover refresh provenance, expiry and revocation, and ancestor permission loss. JWT tests check bound ID, purpose and expiry.
- Final WSL Ubuntu 24.04 Go 1.27.1: `TZ=Australia/Brisbane ../.superpowers/tooling/linux/go/bin/go test ./...` from `backend/` passed. `git diff --check` passed, with only Git's Windows LF/CRLF advisory.

## Review notes

- Actual provider flows, connection administration and stream write fencing remain with their assigned later tasks. The tests exercise HTTP middleware and handlers with a signed test JWT; they do not claim a deployed browser end-to-end run. Existing local 2FA behavior has no server-side handler here and was not extended.
- No live upgrade is safe from this task alone. Existing sessionless JWTs intentionally fail after this change.
