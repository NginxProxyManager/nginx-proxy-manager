# Security Policy

## Supported Versions

Only the latest stable release receives security updates. Older versions are not actively maintained.

| Version | Supported |
| ------- | --------- |
| 2.15.x (latest) | :white_check_mark: |
| < 2.15.0 | :x: |

Docker images: `jc21/nginx-proxy-manager:latest`, `jc21/nginx-proxy-manager:2`

See all releases: https://github.com/NginxProxyManager/nginx-proxy-manager/releases

## Reporting a Vulnerability

**Do NOT open a public GitHub Issue to report a security vulnerability.**

Use GitHub's private vulnerability reporting:

https://github.com/NginxProxyManager/nginx-proxy-manager/security/advisories/new

Please include:

- Affected version (Docker image tag or release)
- Description of the vulnerability
- Steps to reproduce
- Potential impact

Once a fix is available, a public GitHub Security Advisory will be published.

## Dependency and code scanning

Maintainers may use [Snyk](https://snyk.io/) for SCA and SAST. Policy exceptions and documented false positives live in [`.snyk`](.snyk).

Local checks (from repo root):

```bash
cd frontend && npm ci && npm audit
cd ../backend && npm ci && npm audit
cd ../test && npm ci && npm audit
cd ../docs && npm ci && npm audit
```

## Known accepted risks

| Item | Mitigation |
|------|------------|
| `express-fileupload@1.5.2` (no patched release) | Upload middleware limited in [`backend/app.js`](backend/app.js): `limits.fileSize`, `abortOnLimit`, `safeFileNames`, `preserveExtension`. Documented in `.snyk`. |
| Bundled docs iframe (`/documentation`) | Only allowlisted `?section=` keys map to VitePress paths under `/docs/`; iframe uses `sandbox`. |

Revisit `.snyk` entries when dependencies ship fixes or when mitigations change.

## Deployment and secrets hygiene

- Mount **`/data`** persistently so encryption keys and the credential vault survive restarts.
- Prefer **`NPM_SECRETS_ENCRYPTION_KEY`** (32-byte value, base64) in production instead of the auto-generated key under `/data/keys/`.
- Do not commit SSH keys, vault tokens, or API keys in the repository.
- Restrict admin port **81** to trusted networks; use strong passwords, 2FA, and scoped **API keys** for automation.
- Automation tokens (`npmak_…`) are shown once at creation; treat them like passwords.

## Secure development

- Package management uses **npm** and `package-lock.json`.
- JSON API routes return structured JSON via `res.json()` to avoid accidental HTML reflection.
- Production error responses do not include stack traces unless debug mode is enabled.
- OpenAPI operation descriptions are maintained in [`backend/schema/scripts/operation-descriptions.json`](backend/schema/scripts/operation-descriptions.json); regenerate the docs OpenAPI bundle after schema changes ([`docs/README.md`](docs/README.md)).

## Related documentation

- [Automation API](docs/src/advanced/automation-api.md) — API keys, webhooks, credential vault
- [Advanced configuration](docs/src/advanced-config/index.md) — `/data` volume and encryption
- In-app help: **Settings** → DNS credentials, external stores, API keys, webhooks (`/settings?tab=…`; `/credentials` redirects to DNS credentials)
