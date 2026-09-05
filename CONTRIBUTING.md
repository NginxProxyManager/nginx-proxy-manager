# Contributing

This repository follows its own `dev` branch and release line. Changes should be based on `dev`; upstream branch and
version conventions do not automatically apply here.

## Before opening a pull request

- Explain user-visible behavior and compatibility impact.
- Add or update tests for backend, frontend and migration behavior.
- Update this repository's documentation for new UI, API, environment variables or operational requirements.
- Keep API schemas, generated proxy-directive artifacts and locale catalogs synchronized.
- Do not renumber existing database migrations or Nginx configuration schema/profile versions.

The Docker workflow runs backend schema/catalog validation, linting and tests, then frontend linting, locale
compilation, tests and a production build.

## Release versions

The `.version` file is the release source of truth. To prepare a version bump, run:

```bash
node scripts/set-version.mjs 1.4.0
node scripts/set-version.mjs --check
```

Commit the synchronized version changes before manually running the Docker image workflow. The workflow publishes
the full version, minor line, major line and `latest` tags to `moailaozi/nginx-proxy-manager`. Product versions are
independent from database migration filenames and stored Nginx configuration schema versions.
