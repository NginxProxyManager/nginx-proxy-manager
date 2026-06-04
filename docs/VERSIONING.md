# Semantic versioning

This fork uses [Semantic Versioning](https://semver.org/) as **`X.Y.Z`** in the repo and **`vX.Y.Z`**, **`vX.Y`**, **`vX`** on Docker Hub.

## Source of truth

| File | Purpose |
|------|---------|
| [`VERSION`](../VERSION) | Canonical release number (`3.0.0`) |
| [`backend/package.json`](../backend/package.json) | API / runtime version (synced) |
| [`frontend/package.json`](../frontend/package.json) | Frontend package version (synced) |
| [`backend/schema/swagger.json`](../backend/schema/swagger.json) | OpenAPI `info.version` (synced) |

Sync everything from `VERSION`:

```bash
./scripts/sync-version          # read VERSION
./scripts/sync-version 3.1.0    # set VERSION and sync
```

## Release a version

1. Bump [`VERSION`](../VERSION) (or pass the version to `sync-version`).
2. Commit: `git add VERSION backend/package.json frontend/package.json backend/schema/swagger.json`
3. Tag and push (must match `vX.Y.Z`):

```bash
git tag v3.0.0
git push origin v3.0.0
```

4. GitHub Actions **Docker image** workflow builds and pushes:

- `docker.io/salexson/nginx-proxy-manager:v3.0.0`
- `docker.io/salexson/nginx-proxy-manager:v3.0`
- `docker.io/salexson/nginx-proxy-manager:v3`
- `latest` (on non-PR pushes)

## Local publish

```bash
docker login docker.io
./scripts/publish-semver              # uses VERSION
./scripts/publish-semver 3.1.0        # bump, build, push v3.1.0 / v3.1 / v3
NPM_TAG_LATEST=1 ./scripts/publish-semver   # also push :latest
```

## Branch builds

Pushes to `develop` / `master` (when `docker/Dockerfile` changes) still publish `:develop`, `:sha-<short>`, and `:latest`. The image label `NPM_BUILD_VERSION` uses `v` + `VERSION` from the repo.

## API

`GET /api` returns `version.major`, `version.minor`, `version.revision`, and `version.string` (e.g. `v3.0.0`).
