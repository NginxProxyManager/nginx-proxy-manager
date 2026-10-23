# Admin authentication baseline — 2026-10-23

## Checkout and reproduction

Isolated worktree: `D:\Project\nginx-proxy-manager-sso`, base `858cfb839385c376d00677459986e91a0cfef440`. Initial `git status --short`: only untracked `AGENTS.md`, preserved. `rg --files -g AGENTS.md` found only the root instructions. Approved scope: `docs/superpowers/specs/2026-10-23-admin-sso-design.md`. No application files changed for this baseline.

PowerShell; Windows amd64; local timezone Asia/Bangkok. Node `v24.4.1`, npm `11.5.2`, Corepack `0.33.0`; Corepack resolves Yarn Classic `1.22.22` (v1 lockfile). Bare `go version` and `yarn.cmd --version` initially failed (commands absent from PATH). Go `1.27.1`, exactly as go.mod declares, downloaded from `https://go.dev/dl/go1.27.1.windows-amd64.zip` (redirect target HTTP 200, 78,931,360 bytes), extracted under ignored `.superpowers/tooling/go`; local `go.exe version` confirms `go1.27.1 windows/amd64`. No global Go/Node installation or upgrades. Corepack shims created only in ignored `.superpowers/tooling`.

Docker client `29.8.2`, API `1.56`, context `desktop-linux`; server unavailable: `open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified`. WSL has Ubuntu-24.04 and docker-desktop; Ubuntu has no Go, Node or Yarn executable at usual paths. Git Bash is `C:/Program Files/Git/bin/bash.exe`; no jq/yarn found there. Do not run Linux helpers through Windows system32/bash accidentally.

## Actual command results

Run frontend commands in `frontend/` using `C:/nvm4w/nodejs/corepack.cmd yarn` as the local equivalent of unavailable yarn.cmd:

| Command | Observed result |
| --- | --- |
| `yarn install --frozen-lockfile --non-interactive` | PASS, 75.04 seconds; peer warnings for @babel/runtime and csstype; lockfile unchanged |
| `yarn test --run` | FAIL, exit 1 before tests: Vite config `execFile("yarn", ["locale-compile"])` throws `spawn yarn ENOENT` on Windows. Retried with local Corepack shims on PATH: same result. No Vitest pass claim |
| `yarn build` on clean checkout | FAIL, exit 1: TS2307 missing generated `src/locale/lang/*.json` |
| `yarn locale-compile`, then `yarn build` | PASS, exit 0; production Vite assets built in frontend/dist; existing >500 kB chunk warning |
| `yarn lint` | PASS, exit 0; checked 243 files, no fixes |
| bare `go test ./...` | Not executable before local toolchain preparation |
| local `go.exe test ./...` in backend | FAIL, exit 1: missing embed/assets plus Windows SQLite dependency build failure and existing platform-sensitive tests |
| copy generated frontend/dist to backend/embed/assets (same layout as scripts/ci/build-frontend), rerun local `go.exe test ./...` | FAIL, exit 1: modernc SQLite replacement function signature mismatch; TestDBConfigFile mode expected 0600 vs actual 0666; TestUnixMilliToNiceFormat expected UTC+10 vs actual UTC+7 |

Exact SQLite failure: `gitlab.com/jc21com/sqlite@v1.22.2-0.20230527022643-b56cedb3bc85/lib/sqlite_windows_amd64.go:197470:4: cannot use libc.XGetFileAttributesExW ... as ... WINBOOL value in struct literal`. Most database-dependent packages do not compile; some independent packages pass. These are baseline failures, not SSO regressions. No dependencies were edited to conceal them. Ignored generated assets/locales remain available for subsequent tasks.

Cypress not run: no running application/Docker daemon, dependencies not installed in test/. Existing `SetupLogin.cy.js` resets users, creates first local user, logs in, changes password; it contains old Chakra selectors. Run helpers with Bash/WSL against a debug-enabled disposable app (default port 3081); do not reset production users. Docker-based backend CI similarly requires a working daemon. Full successful auth E2E and Linux backend baseline remain prerequisites, not presumed passes.

## Route/access matrix at base HEAD

All `/api` paths below include the `/api` prefix. Full router decodes JWT from Authorization header or query using RS256; decode alone does not enforce access. `EnforceSetup` rejects requests until first user setup completes. `Enforce` bypasses token/capability checks when `config.IsSetup` is false (bootstrap); afterwards validates uid and enabled user, and requested capabilities from DB, allowing full-admin.

| Route | Access and behavior |
| --- | --- |
| GET /api/, GET /api/schema | Anonymous health (including setup flags) and schema |
| POST /api/setup/database | Only database-setup router; request schema; other /api paths return 403 during database setup |
| GET /api/auth | Anonymous after setup; enabled auth types |
| POST /api/auth | Anonymous after setup; schema allows local or ldap only; enabled-type gate, credential validation, disabled-user check; issues application JWT directly |
| GET /oauth/login, GET /oauth/redirect | Anonymous after setup; OAuth-enabled gate; existing provider authorization/callback; auto-link/create by email when configured, disabled-user check; JWT returned in redirect query token_response |
| POST /api/auth/refresh | Setup + Enforce(); enabled-user lookup; replaces application token |
| POST /api/auth/sse | Setup + Enforce(); enabled-user lookup; issues SSE token |
| /api/sse/* | Setup + SSEAuth; valid JWT, enabled uid, issuer sse; outside ordinary 30-second API timeout |
| POST /api/users | users.manage (or full-admin) after setup; bootstrap bypass before setup creates first full-admin, local password, sets IsSetup |
| GET/PUT /api/users/me | Setup + Enforce(), no capability requirement; shared UpdateUser schema accepts name/email/is_disabled/capabilities; handler prevents self-disable and own full-admin removal, saves capability associations only when !self |
| POST /api/users/me/auth | Setup + Enforce(); requires valid current local secret, rejects system users; password replacement |
| GET/list/PUT/DELETE numeric users, DELETE me, POST numeric user/auth | Setup + users.manage; numeric target equal self still requires current password for auth change; self-delete rejected (DELETE me parsing does not resolve me) |
| /api/settings/* | Setup + settings.manage (or full-admin) |
| /api/config, /api/version/check | Setup + Enforce(), no capability |
| resource CRUD including /api/streams | Setup + relevant view/manage capability via resource_routes.go; streams use streams.view/streams.manage; these are TCP/UDP resources, distinct from event streams |
| DELETE /api/users; POST /api/sse-notification | Debug log level only; no EnforceSetup or Enforce. Deletes all users/re-enters setup; sends test notification. Must not be exposed in production |
| frontend assets/SPA fallback | Anonymous through NotFound handler; unmatched /api paths receive API 404 |

## Token issuance and regression boundaries

Searches covered `jwt.Generate`, `njwt.Generate`, `SignedString`, `jwt.New`, `Enforce(`, `loginAs`, `verify2FA`, auth route declarations and non-locale 2FA code. Exactly five production Generate call sites: auth.go local login (111), LDAP login (193), refresh (221), SSE issuance (248); oauth.go OAuth callback (151). All sign through internal/jwt/jwt.go. No persisted session/source identifier, no logout/revocation endpoint. Both API and SSE tokens last one day; the short-lived SSE comment is inaccurate. Enforce has no issuer check, so a valid SSE JWT is not distinguished from an API JWT by ordinary API enforcement. Refresh/SSE must preserve future SSO provenance and enforce revocation.

Frontend AuthContext writes ordinary login/refresh responses to AuthStore; local logout clears client tokens, impersonation logout pops a token stack. `loginAsUser` calls POST /api/users/{id}/login; there is no matching backend handler or route at this HEAD, so advertised impersonation is unavailable (route inspection predicts 404; not exercised live). No additional token issuer was found for it.

Local password authentication is implemented: bcrypt validation, disabled-user gate, one-second delay for wrong password, immediate API token response; self-service password changes verify current secret. Preserve this behavior. LDAP and legacy OAuth are separate login issuers that require explicit future SSO policy decisions to prevent bypasses.

## 2FA release prerequisite — separate decision required

The UI advertises 2FA through SiteHeader, TwoFactorModal and Login/AuthContext. Frontend verify2FA calls POST /api/auth/2fa; status/setup/enable/disable/backup-codes calls target /api/users/{id}/2fa and subpaths. No backend 2FA routes, challenge handler, token challenge generation or stored TOTP implementation was found. newTokenLocal issues a full JWT immediately after password validation. These frontend calls resolve to absent routes (API 404 expected by source inspection, not claimed live verified). There is no working password-2FA backend to preserve or claim as tested. Before release, explicitly decide to implement and verify password 2FA or stop advertising unavailable functionality in a separate fix; do not silently expand the SSO task. SSO bypassing NPM 2FA cannot imply a working password 2FA baseline.

## Evidence and self-review

Raw logs (ignored local execution evidence): `.superpowers/sdd/2026-10-23-admin-sso/baseline-{frontend-test,frontend-build,frontend-lint,locale,frontend-build-prepared,frontend-test-prepared,backend-test,backend-prepared}.log`. Reviewed router, auth/OAuth/users handlers, auth/setup/SSE middleware, JWT generator, resource routes, token/update schemas, auth entity, AuthContext, backend API clients and Cypress SetupLogin. Matrix reports source behavior, not an unperformed live access test. Changes are documentation only; no runtime/schema/dependency fixes, no destructive debug endpoint calls, original checkout untouched.

## Supplemental environment evidence during implementation

- Docker Desktop started for isolated test databases; its automatic restart completed with engine 29.9.2. Dedicated test containers carry label `codex.task=admin-sso`; no existing application container was changed.
- Exact Go 1.27.1 Linux toolchain is available under ignored `.superpowers/tooling/linux/go`, invoked through Ubuntu-24.04 WSL. This avoids the pre-existing Windows SQLite compilation issue without dependency changes.
- Frontend Vitest can run through ignored `frontend/node_modules/.cache/sso-vitest.config.ts`, which imports the real Vite config and excludes only the two locale watcher/server-start hooks. Locale assets were compiled first. Command from frontend: `node node_modules/vitest/vitest.mjs run --config node_modules/.cache/sso-vitest.config.ts`. Result: 3 files, 18 tests, 10 pass / 8 fail. Seven Router cases fail finding expected headings; Estonian coverage test reports 13 missing setup-database keys. This workaround does not make the normal command pass and is not a production configuration change. Evidence: `.superpowers/sdd/2026-10-23-admin-sso/baseline-frontend-test-workaround.log`.

## Task 7 OIDC dependency and vulnerability selection

`go list -m -json` confirmed `github.com/coreos/go-oidc/v3@v3.21.0` (Go 1.25) and `github.com/go-jose/go-jose/v4@v4.1.6` (Go 1.24), both compatible with the repository's Go 1.27.1. The existing `golang.org/x/oauth2@v0.37.0` is reused. The [CoreOS v3.21.0 release](https://github.com/coreos/go-oidc/releases/tag/v3.21.0) includes the JOSE dependency. The [go-jose v4.1.6 release](https://github.com/go-jose/go-jose/releases/tag/v4.1.6) fixes [GHSA-mgcc-cww5-fp2q](https://github.com/go-jose/go-jose/security/advisories/GHSA-mgcc-cww5-fp2q), a crafted RSA JWK denial of service affecting v4.1.5 and earlier; v4.1.6 is explicitly pinned above CoreOS's minimum. No unrelated modules were upgraded.

After the pin, `govulncheck -json ./internal/sso` under Docker `golang:1.27.3` yielded one finding: existing `golang.org/x/crypto/openpgp` GO-2026-5932 at module level only, with no package/symbol reachability and no finding attributed to the new OIDC dependencies. Raw local evidence: `.superpowers/sdd/2026-10-23-admin-sso/task-7-vuln.json`. JSON mode's exit 0 is not a clean-scan signal. This package-scoped scan does not replace the release-wide scan and actual build toolchain check in Task 15.
