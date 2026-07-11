# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Nginx Proxy Manager — a Docker-packaged admin UI + API over Nginx for reverse-proxy hosts, redirections, streams, 404 hosts, and Let's Encrypt / custom SSL. Three deployable pieces live in one repo: a Node/Express backend (`backend/`), a React SPA (`frontend/`), and a Cypress test suite (`test/`). At runtime everything ships inside a single container running under s6-overlay, where the backend generates Nginx config files from Liquid templates and reloads Nginx.

## Development

The dev environment is a full Docker Compose stack — there is no bare-metal `npm start`. It spins up the fullstack container plus MariaDB, Postgres, PowerDNS, step-ca, Squid proxy, Authentik, and Swagger.

```bash
./scripts/start-dev          # build + bring up the whole dev stack
./scripts/start-dev -f       # same, then follow backend logs
./scripts/stop-dev
./scripts/destroy-dev        # tear down + remove volumes
docker logs -f npm2dev.core  # follow the backend/core container
```

Dev URLs: Admin UI `http://127.0.0.1:3081`, Nginx `http://127.0.0.1:3080`, Swagger `http://127.0.0.1:3001`. The backend listens on port `3000` inside the container.

### Lint / format (Biome, both backend and frontend)

```bash
# in backend/ or frontend/
yarn lint        # biome lint
yarn prettier    # biome format --write
```

Biome config (`biome.json`) uses **tab indentation** — match it.

### Frontend

```bash
cd frontend
yarn dev         # vite dev server (port 5173); auto-compiles locales on start/change
yarn build       # tsc typecheck + vite build
yarn test        # vitest
yarn test -- src/path/to/File.test.tsx   # single test file
```

Locales are FormatJS-based: extract with `yarn locale-extract`, compile with `yarn locale-compile`. Vite recompiles locales automatically when files under `src/locale/src` change. Run `node check-locales.cjs` to validate translation completeness.

### Backend

```bash
cd backend
yarn validate-schema                # validate the OpenAPI/JSON schema
node scripts/regenerate-config      # regenerate nginx config from templates
```

The backend is ESM (`"type": "module"`) — use `import`, not `require`. Migrations run automatically on startup via `migrateUp()`.

### End-to-end tests (Cypress)

E2E tests run against the CI docker stack, not the dev stack. Specs are `test/cypress/e2e/*.cy.js`; requests are proxied through Squid (`HTTP_PROXY=127.0.0.1:8128`).

```bash
cd test
yarn cypress:dev            # run against a running dev stack
yarn cypress:headless       # headless run against CI stack
yarn swagger-lint           # lint the OpenAPI schema (vacuum)

./scripts/ci/fulltest-cypress   # full CI-style run (sqlite/mysql/postgres matrices exist in docker/)
```

## Architecture

### Backend layering (`backend/`)

Request flow is **route → internal → model**, a strict three-layer split:

- **`routes/`** — Express routers, one per resource. `routes/main.js` mounts them all under `/api`-equivalent paths (`/nginx/proxy-hosts`, `/users`, `/tokens`, etc.). Routes handle HTTP concerns, JWT auth (`lib/express/jwt.js`), permission checks, and schema validation only.
- **`internal/`** — business logic. This is where the real work lives (e.g. `internal/certificate.js` is ~37KB of Let's Encrypt/certbot orchestration). Internal modules call each other and the models; they never touch `req`/`res`.
- **`models/`** — Objection.js models over a Knex query builder. `db.js`/`knexfile.js` wire the connection; the same schema targets **SQLite, MySQL/MariaDB, and Postgres** (see `lib/config.js` for `DB_*` env selection).

`app.js` builds the Express app (middleware, security headers, error handler); `index.js` is the entrypoint that runs migrations → setup → schema compile → IP-ranges fetch → starts timers (cert renewal, IP ranges) → listens on 3000.

### Nginx config generation

This is the core mechanism. `internal/nginx.js` renders per-host config from **Liquid templates in `backend/templates/`** (`proxy_host.conf`, `redirection_host.conf`, `stream.conf`, `dead_host.conf`, plus `_`-prefixed partials like `_location.conf`, `_ssl.conf`, `_access.conf`). The `configure()` flow is: test nginx → delete old config → generate new config → test again → on success mark host `nginx_online` in DB, on failure remove the config and record `nginx_err` in the model's `meta`. When editing proxy behavior, the change usually belongs in a template, not in JS.

### Database schema

Knex migrations in `backend/migrations/` (timestamp-prefixed). Never edit an existing migration — add a new one. Migrations must work across all three supported databases.

### Frontend (`frontend/src/`)

React 19 + Vite + TypeScript SPA using **Tabler** (`@tabler/core`) for UI, **TanStack Query** for server state, **Formik** for forms, **react-intl** for i18n, and **react-router-dom** v7. Structure: `api/backend/` (one file per API call, e.g. `createProxyHost.ts`, wrapping `base.ts`), `pages/`, `modules/`, `components/`, `modals/`, `hooks/`, `context/`, `locale/`. `Router.tsx` defines routes; `App.tsx` wires providers. API responses/requests are camelCase↔snake_case converted via `humps`.

### Docker / runtime (`docker/`)

`docker/Dockerfile` is a **buildx multi-arch** build that assumes the frontend is already built (`./scripts/frontend-build`). Runtime uses s6-overlay (`docker/rootfs/`). `docker/docker-compose.dev.yml` defines the dev stack; `docker-compose.ci.*.yml` variants cover the sqlite/mysql/postgres CI matrices.

## Conventions

- Version lives in `.version` (currently 2.15.1); `backend/package.json` and `frontend/package.json` carry an unrelated internal `2.0.0`.
- Errors: throw the typed errors from `backend/lib/error.js` (e.g. `ItemNotFoundError`); only errors marked `public` leak their message to clients, and stack traces are exposed only in debug mode.
- CI-only routes (`routes/ci.js`) are mounted at `/ci` when `isCI()` is true — do not rely on them in production paths.
- `armv7` is unsupported in 2.14+.
