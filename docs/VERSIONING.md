# Versioning

Nginx Proxy Manager uses [Semantic Versioning](https://semver.org/). The release number in [`.version`](../.version) is the canonical **`X.Y.Z`** value for the tree.

## Source of truth

| File | Purpose |
|------|---------|
| [`.version`](../.version) | Release number (e.g. `2.15.1`) |
| [`backend/package.json`](../backend/package.json) | API / runtime package version |
| [`frontend/package.json`](../frontend/package.json) | Frontend package version |
| [`backend/schema/swagger.json`](../backend/schema/swagger.json) | OpenAPI `info.version` |
| [`docs/src/public/openapi.json`](src/public/openapi.json) | Bundled spec for VitePress (regenerate after schema changes) |

Sync package and schema versions from `.version`:

```bash
./scripts/sync-version
```

## Releases

Official images are published as **`jc21/nginx-proxy-manager`** on Docker Hub. Release tags follow **`vX.Y.Z`** (and related major/minor tags) on [GitHub Releases](https://github.com/NginxProxyManager/nginx-proxy-manager/releases).

Maintainers typically:

1. Update [`.version`](../.version) (or run `./scripts/sync-version X.Y.Z` when that workflow is enabled for the release).
2. Refresh OpenAPI operation descriptions if needed (`node backend/schema/scripts/apply-operation-descriptions.mjs`).
3. Regenerate the docs bundle: `cd docs && npm install && npm run generate:openapi`.
4. Tag `vX.Y.Z` and publish the release image.

## API version string

`GET /api` returns `version.major`, `version.minor`, `version.revision`, and `version.string` (for example `v2.15.1`).
