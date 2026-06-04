---
outline: deep
---

# API Reference (Swagger UI)

Interactive OpenAPI browser with **Try it out**. Requests use server URL **`/api`** relative to this site’s origin.

For that to work, the NPM admin API must be reachable on the same host (for example reverse-proxy `/api` to port `81`). See [deploy/nginx/docs-api-proxy.conf.example](https://github.com/general-alexson/nginx-proxy-manager/blob/develop/deploy/nginx/docs-api-proxy.conf.example) for a sample nginx config. If you only host static docs without `/api`, use [Redoc](/api-reference/) for reading and the [Automation API](/advanced/automation-api) guide for curl examples.

Authenticate with **Authorize** using `Bearer <token>` from `POST /api/tokens` or an API key.

<ClientOnly>
  <ApiReferenceSwagger />
</ClientOnly>
