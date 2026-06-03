---
outline: deep
---

# Automation API

Nginx Proxy Manager exposes a REST API at `/api` on the admin port (default `81`). OpenAPI schema: `GET /api/schema`.

## Authentication

### User JWT (existing)

```bash
curl -s -X POST http://127.0.0.1:81/api/tokens \
  -H 'Content-Type: application/json' \
  -d '{"identity":"admin@example.com","secret":"your-password"}'
```

Use `Authorization: Bearer <token>` on subsequent requests. Tokens default to 1-day expiry; refresh with `GET /api/tokens`.

### API keys (new)

Admins can create long-lived keys:

```bash
curl -s -X POST http://127.0.0.1:81/api/api-keys \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"terraform","permissions":{"proxy_hosts":"manage","certificates":"manage"}}'
```

The response includes `key` once (`npmak_...`). Use it as:

`Authorization: Bearer npmak_<prefix>_<secret>`

## Proxy hosts

| Method | Path |
|--------|------|
| GET | `/api/nginx/proxy-hosts` |
| POST | `/api/nginx/proxy-hosts` |
| GET | `/api/nginx/proxy-hosts/{id}` |
| PUT | `/api/nginx/proxy-hosts/{id}` |
| DELETE | `/api/nginx/proxy-hosts/{id}` |
| POST | `/api/nginx/proxy-hosts/{id}/enable` |
| POST | `/api/nginx/proxy-hosts/{id}/disable` |

## Certificates

| Method | Path |
|--------|------|
| GET | `/api/nginx/certificates` |
| POST | `/api/nginx/certificates` |
| PUT | `/api/nginx/certificates/{id}` |
| DELETE | `/api/nginx/certificates/{id}` |
| POST | `/api/nginx/certificates/{id}/renew` |

Append `?async=true` to **POST** (create) or **renew** to receive `202` with `{ job_id, status }`. Poll `GET /api/jobs/{job_id}`.

## DNS credential vault

Secrets are encrypted on the **`/data` persistent volume** at `/data/credentials/`. Metadata is in the database.

| Method | Path |
|--------|------|
| GET | `/api/credentials` |
| POST | `/api/credentials` |
| PUT | `/api/credentials/{id}` |
| DELETE | `/api/credentials/{id}` |
| POST | `/api/credentials/{id}/test` |

Create a certificate referencing a stored credential:

```json
{
  "provider": "letsencrypt",
  "domain_names": ["example.com"],
  "meta": {
    "dns_challenge": true,
    "dns_provider": "cloudflare",
    "credential_ref": { "type": "internal", "id": 1 }
  }
}
```

Set `NPM_SECRETS_ENCRYPTION_KEY` (32-byte base64) before first use in production, or NPM generates `/data/keys/secrets.json` on the data volume.

## External credential stores (Vault, AWS, Azure, Infisical)

Configure providers (admin, Settings → External Credential Stores or API):

| Method | Path |
|--------|------|
| GET | `/api/credential-providers` |
| POST | `/api/credential-providers` |
| PUT | `/api/credential-providers/{id}` |
| DELETE | `/api/credential-providers/{id}` |
| POST | `/api/credential-providers/{id}/test` |
| POST | `/api/credential-providers/{id}/test-resolve` |

Provider `type`: `vault`, `aws`, `azure`, `infisical`, `http`. OIDC client secrets are stored encrypted under `/data/credentials/providers/`.

Reference in a certificate:

```json
"meta": {
  "dns_challenge": true,
  "dns_provider": "cloudflare",
  "credential_ref": {
    "type": "external",
    "provider_id": 1,
    "path": "dns/cloudflare/prod",
    "field": "optional_json_key"
  }
}
```

## Webhooks

Configure endpoints (admin only):

| Method | Path |
|--------|------|
| GET | `/api/webhooks` |
| POST | `/api/webhooks` |
| DELETE | `/api/webhooks/{id}` |

Events: `proxy_host.created|updated|deleted|enabled|disabled`, `certificate.created|updated|deleted|renewed`. Verify `X-NPM-Signature: sha256=<hmac>` over the raw JSON body.

## Docker volume

Mount persistent storage:

```yaml
volumes:
  - ./data:/data
```

The credential vault requires `/data` to survive container recreation.
