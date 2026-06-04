---
outline: deep
---

# API Reference (Swagger UI)

Interactive OpenAPI browser with **Try it out**. Requests use server URL **`/api`** relative to this site’s origin.

For that to work, the NPM admin API must be reachable on the same host (for example reverse-proxy `/api` to port `81`). If you only host static docs, use [Redoc](/api-reference) for reading and the [Automation API](/advanced/automation-api) guide for curl examples.

Authenticate with **Authorize** using `Bearer <token>` from `POST /api/tokens` or an API key.

<ClientOnly>
  <ApiReferenceSwagger />
</ClientOnly>
