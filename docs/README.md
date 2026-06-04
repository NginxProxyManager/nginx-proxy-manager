# Nginx Proxy Manager documentation (VitePress)

Production builds are bundled under **`/docs/`** on the admin UI static root (port 81). The React app exposes them at **`/documentation`** (iframe; deep links use **`?section=`** with allowlisted Help section names, e.g. `/documentation?section=Settings`). Build via `scripts/frontend-build`, which copies `docs/dist` to `frontend/dist/docs/`.

VitePress `base` is `/docs/` — see [`.vitepress/config.mts`](.vitepress/config.mts).

## Development

```bash
cd docs
npm install
npm run dev
```

`predev` / `prebuild` run `generate:openapi`, which dereferences [`../backend/schema/swagger.json`](../backend/schema/swagger.json) into [`src/public/openapi.json`](src/public/openapi.json).

## API reference pages

| URL (under `/docs/` in production) | Viewer |
|-----|--------|
| `/docs/api-reference/` | Redoc (read-only) |
| `/docs/api-reference/swagger` | Swagger UI (try-it-out against `/api` on the same host) |

### Swagger “Try it out” on a separate docs hostname

Bundled Swagger uses server URL `/api` on the **same origin** as the docs. To host static docs on another domain and still try requests, reverse-proxy `/api` to the NPM admin API (port 81). See [`deploy/nginx/docs-api-proxy.conf.example`](../deploy/nginx/docs-api-proxy.conf.example).

On a single NPM instance, open **http://host:81/documentation** or static **http://host:81/docs/** — no extra proxy required.

### Dev: live schema vs bundled docs

| URL | Purpose |
|-----|---------|
| `http://localhost:3082` | Swagger UI → live `GET /api/schema` from dev stack (`docker/docker-compose.dev.yml`) |
| `http://localhost:3081/documentation` | Bundled Redoc/Swagger from last frontend build |

## When you change the API schema

If you edit files under `backend/schema/`, add or refresh operation descriptions (Vacuum), then regenerate and commit the bundle:

```bash
# Add or edit entries in backend/schema/scripts/operation-descriptions.json, then:
node backend/schema/scripts/apply-operation-descriptions.mjs
cd docs
npm run generate:openapi
git add src/public/openapi.json
```

See [VERSIONING.md](VERSIONING.md) (upstream-owned versions; fork image tags only) and [SECURITY.md](../SECURITY.md) for vulnerability reporting.
