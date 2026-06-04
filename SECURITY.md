# Security Policy

## Supported versions

This fork publishes test images to `docker.io/salexson/nginx-proxy-manager` (`develop`, `sha-*`, `latest`). **Semantic versioning and security releases are upstream.**

| Image / scope | Supported |
|---------------|-----------|
| `develop`, `latest`, `sha-*` (fork images) | Best-effort for this fork |
| Upstream releases (`jc21/nginx-proxy-manager`, tags from [NginxProxyManager/nginx-proxy-manager](https://github.com/NginxProxyManager/nginx-proxy-manager)) | See [upstream SECURITY.md](https://github.com/NginxProxyManager/nginx-proxy-manager/blob/master/SECURITY.md) |

[`.version`](.version) mirrors upstream; do not bump or tag releases on this fork.

## Reporting a vulnerability

**Do not open a public GitHub issue for a security vulnerability.**

| Scope | Report here |
|-------|-------------|
| This fork (fork-only UI/API or deploy tooling) | [Private vulnerability report — general-alexson/nginx-proxy-manager](https://github.com/general-alexson/nginx-proxy-manager/security/advisories/new) |
| Core Nginx Proxy Manager behavior shared with upstream | [Private vulnerability report — NginxProxyManager/nginx-proxy-manager](https://github.com/NginxProxyManager/nginx-proxy-manager/security/advisories/new) (or report to the fork and we will coordinate) |

Include:

- Affected version (image tag, commit SHA, or `.version` file)
- Description and impact
- Steps to reproduce
- Suggested fix (optional)

We aim to acknowledge reports within a few business days. Critical issues in published images are prioritized for patch releases on `develop` and Docker Hub tags documented in [`README.md`](README.md).

## Dependency and code scanning

Maintainers use [Snyk](https://snyk.io/) for SCA and SAST on this tree. Policy exceptions and documented false positives live in [`.snyk`](.snyk).

Local checks (from repo root):

```bash
cd frontend && npm ci && npm audit
cd ../backend && npm ci && npm audit
cd ../test && npm ci && npm audit
cd ../docs && npm ci && npm audit
```

After changing application code, run your Snyk Code scan before merging security-sensitive changes.

## Known accepted risks

| Item | Mitigation |
|------|------------|
| `express-fileupload@1.5.2` (no upstream fix) | Upload middleware limited in [`backend/app.js`](backend/app.js): `limits.fileSize`, `abortOnLimit`, `safeFileNames`, `preserveExtension`. Documented in `.snyk`. |
| Bundled docs iframe (`/documentation`) | Only allowlisted `?section=` keys map to VitePress paths under `/docs/`; iframe uses `sandbox`. |

Revisit `.snyk` entries when dependencies ship fixes or when mitigations change.

## Deployment and secrets hygiene

- Mount **`/data`** persistently so encryption keys and the credential vault survive restarts.
- Prefer **`NPM_SECRETS_ENCRYPTION_KEY`** (32-byte value, base64) in production instead of relying only on the auto-generated key under `/data/keys/`.
- Do not commit inventory, SSH keys, Infisical tokens, or API keys. Load deploy secrets from your vault at runtime (see [`deploy/README.md`](deploy/README.md)).
- Restrict admin port **81** to trusted networks; use strong passwords, 2FA, and scoped **API keys** for automation.
- Automation tokens (`npmak_…`) are shown once at creation; treat them like passwords.

## Secure development

- Package management uses **npm** and `package-lock.json` (not Yarn).
- JSON API routes return structured JSON via `res.json()` to avoid accidental HTML reflection.
- Production error responses do not include stack traces unless debug mode is enabled.
- OpenAPI operation descriptions are maintained in [`backend/schema/scripts/operation-descriptions.json`](backend/schema/scripts/operation-descriptions.json); regenerate docs OpenAPI after schema changes ([`docs/README.md`](docs/README.md)).

## Security-related documentation

- [Automation API](docs/src/advanced/automation-api.md) — API keys, webhooks, credential vault
- [Advanced configuration](docs/src/advanced-config/index.md) — `/data` volume and encryption
- In-app help: **Settings** → DNS credentials, external stores, API keys, webhooks (`/settings?tab=…`; `/credentials` redirects to DNS credentials)
