# Nginx Proxy Manager documentation (VitePress)

Production builds are bundled under **`/docs/`** on the admin UI static root (port 81). The React app exposes them at **`/documentation`** (iframe + section nav). Build via `scripts/frontend-build` or CI, which copies `docs/dist` to `frontend/dist/docs/`.

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
| `/docs/api-reference` | Redoc (read-only) |
| `/docs/api-reference/swagger` | Swagger UI (try-it-out against `/api` on the same host) |

## When you change the API schema

If you edit files under `backend/schema/`, regenerate and commit the bundle:

```bash
cd docs
npm run generate:openapi
git add src/public/openapi.json
```

See [VERSIONING.md](VERSIONING.md) for release versioning.
