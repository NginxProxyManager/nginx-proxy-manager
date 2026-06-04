# Versioning (upstream)

**This fork does not publish its own semantic version releases.** Version numbers and git tags are owned by [NginxProxyManager/nginx-proxy-manager](https://github.com/NginxProxyManager/nginx-proxy-manager).

## What we use

| File | Role |
|------|------|
| [`.version`](../.version) | Upstream release label (e.g. `2.15.1`). **Do not bump on this fork** — take updates from upstream merges. |
| [`backend/package.json`](../backend/package.json), [`frontend/package.json`](../frontend/package.json), [`backend/schema/swagger.json`](../backend/schema/swagger.json) | Kept in line with upstream; not independently versioned here. |

When merging `upstream/develop`, keep their `.version` and package/schema versions unless you are resolving a deliberate fork-only change.

## Fork Docker images

Local publish scripts can tag images for testing only:

| Tag style | Example |
|-----------|---------|
| Branch | `docker.io/salexson/nginx-proxy-manager:develop` |
| Commit | `docker.io/salexson/nginx-proxy-manager:sha-abc1234` |
| Rolling | `:latest` when you choose to push it |

There are **no** fork-managed `vX.Y.Z` Hub tags. Do not run `git tag v*` on this repository for releases.

**Publish a branch build:**

```bash
docker login docker.io
SKIP_TESTS=1 ./scripts/publish-image              # default :develop
NPM_TAG=latest NPM_TAG_LATEST=0 ./scripts/publish-image
```

`./scripts/publish-semver` is disabled in this fork (upstream owns semver releases).

## OpenAPI bundle (docs)

After upstream schema changes:

```bash
node backend/schema/scripts/apply-operation-descriptions.mjs
cd docs && npm install && npm run generate:openapi
git add docs/src/public/openapi.json
```

See [docs/README.md](README.md) and upstream [release docs](https://github.com/NginxProxyManager/nginx-proxy-manager/releases).

## API version string

`GET /api` reports the version baked into the image from upstream sources (e.g. `v2.15.1` when `.version` and runtime metadata match upstream).
