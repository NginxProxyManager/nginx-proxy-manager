# CrowdSec OpenResty bouncer

This image adds the official CrowdSec OpenResty bouncer without replacing Nginx
Proxy Manager's existing OpenResty installation. Each build downloads the
current `main` branch of both `cs-openresty-bouncer` and `lua-cs-bouncer`; the
OpenResty bouncer source supplies its current vendored `lua-resty-http` files.
Lua cjson is provided by NPM's existing OpenResty image. These components are
intentionally not release- or commit-pinned.

The bouncer Lua files are installed in `/etc/nginx/lualib` (including vendored
dependencies in `plugins/crowdsec`), templates in
`/var/lib/crowdsec/lua/templates`, and Nginx integration in
`/etc/nginx/conf.d/crowdsec_openresty.conf`. NPM loads that file from its
`http` context after its real-IP setup, so decisions use the resolved client IP.

## Docker Compose configuration

Configure CrowdSec entirely through the NPM service's environment. The image
generates `/etc/crowdsec/bouncers/crowdsec-openresty-bouncer.conf` once during
container startup, after Docker secrets are resolved and before Nginx starts.
It is written root-only and the API key is never printed. No bind mount, local
override file, image rebuild, or in-container edit is required.

```yaml
services:
  npm:
    image: ghcr.io/OWNER/REPOSITORY:latest
    environment:
      CROWDSEC_ENABLED: "true"
      CROWDSEC_API_URL: "http://crowdsec:8080"
      CROWDSEC_API_KEY: "YOUR_BOUNCER_API_KEY"
      CROWDSEC_MODE: "live"
      CROWDSEC_BOUNCING_ON_TYPE: "all"
      CROWDSEC_FALLBACK_REMEDIATION: "ban"
      CROWDSEC_CACHE_EXPIRATION: "1"
      CROWDSEC_UPDATE_FREQUENCY: "10"
      CROWDSEC_REQUEST_TIMEOUT: "3000"
      CROWDSEC_SSL_VERIFY: "true"
```

`CROWDSEC_ENABLED` defaults to `false`. Therefore an image starts normally
without a CrowdSec LAPI URL or API key and performs no enforcement. To enable
it, provide both `CROWDSEC_API_URL` and `CROWDSEC_API_KEY` with
`CROWDSEC_ENABLED=true`, then restart the container. Check Nginx logs for
`Initialisation done`; use a CrowdSec test decision to verify enforcement.
`nginx -t` checks configuration syntax only, not LAPI connectivity.

### Environment reference

Every option below maps directly to the same official bouncer configuration
key with the `CROWDSEC_` prefix. Values containing newlines are rejected;
boolean, numeric, and enumerated values are validated at startup.

| Variable | Default | Accepted values / purpose |
| --- | --- | --- |
| `CROWDSEC_ENABLED` | `false` | `true` or `false`; enables the bouncer. |
| `CROWDSEC_API_URL` | empty | CrowdSec LAPI URL. |
| `CROWDSEC_API_KEY` | empty | CrowdSec bouncer API key. |
| `CROWDSEC_USE_TLS_AUTH` | `false` | `true` or `false`; use LAPI mTLS. |
| `CROWDSEC_TLS_CLIENT_CERT` | `/path/to/client.crt` | Client certificate for mTLS. |
| `CROWDSEC_TLS_CLIENT_KEY` | `/path/to/client.key` | Client key for mTLS. |
| `CROWDSEC_CACHE_EXPIRATION` | `1` | Non-negative integer, in seconds. |
| `CROWDSEC_BOUNCING_ON_TYPE` | `all` | `ban`, `captcha`, or `all`. |
| `CROWDSEC_FALLBACK_REMEDIATION` | `ban` | `ban` or `captcha`. |
| `CROWDSEC_REQUEST_TIMEOUT` | `3000` | Non-negative integer, milliseconds. |
| `CROWDSEC_UPDATE_FREQUENCY` | `10` | Non-negative integer, seconds. |
| `CROWDSEC_ENABLE_INTERNAL` | `false` | `true` or `false`; inspect internal requests. |
| `CROWDSEC_MODE` | `live` | `live` or `stream`. |
| `CROWDSEC_SCENARIOS_CONTAINING` | empty | Comma-separated scenario substrings to include. |
| `CROWDSEC_SCENARIOS_NOT_CONTAINING` | empty | Comma-separated scenario substrings to exclude. |
| `CROWDSEC_EXCLUDE_LOCATION` | empty | Comma-separated request paths to exclude. |
| `CROWDSEC_BAN_TEMPLATE_PATH` | packaged ban template | Path to ban template. |
| `CROWDSEC_REDIRECT_LOCATION` | empty | Redirect target for bans; takes precedence over return code. |
| `CROWDSEC_RET_CODE` | empty | Optional non-negative HTTP response code. |
| `CROWDSEC_CAPTCHA_PROVIDER` | empty | `recaptcha`, `hcaptcha`, or `turnstile`. |
| `CROWDSEC_SECRET_KEY` | empty | CAPTCHA provider secret key. |
| `CROWDSEC_SITE_KEY` | empty | CAPTCHA provider site key. |
| `CROWDSEC_CAPTCHA_TEMPLATE_PATH` | packaged CAPTCHA template | Path to CAPTCHA template. |
| `CROWDSEC_CAPTCHA_EXPIRATION` | `3600` | Non-negative integer, seconds. |
| `CROWDSEC_APPSEC_URL` | empty | CrowdSec AppSec URL. |
| `CROWDSEC_APPSEC_FAILURE_ACTION` | `passthrough` | AppSec failure behavior accepted by the bouncer. |
| `CROWDSEC_APPSEC_CONNECT_TIMEOUT` | empty | Optional non-negative integer, milliseconds. |
| `CROWDSEC_APPSEC_SEND_TIMEOUT` | empty | Optional non-negative integer, milliseconds. |
| `CROWDSEC_APPSEC_PROCESS_TIMEOUT` | empty | Optional non-negative integer, milliseconds. |
| `CROWDSEC_ALWAYS_SEND_TO_APPSEC` | `false` | `true` or `false`. |
| `CROWDSEC_APPSEC_DROP_UNREADABLE_BODY` | `false` | `true` or `false`. |
| `CROWDSEC_SSL_VERIFY` | `true` | `true` or `false`; verify LAPI/AppSec TLS certificates. |

## Upstream update and publishing automation

`Check upstream updates` runs daily and can be started manually. It fetches
only Nginx Proxy Manager's stable `master` branch, so its commits include only
changes already merged upstream. It checks CrowdSec's latest GitHub release,
and both CrowdSec stable branches. It never consumes open or unmerged pull
requests as source updates.

When an update exists, the workflow opens or refreshes one
`automation/upstream-updates` PR rather than creating duplicates. The PR must
be reviewed and merged normally. Its merge pushes to `master`, which causes
`Build and publish container image` to build and publish the new multi-arch
GHCR image. Both workflows also support manual dispatch. The update PR refreshes
the Docker build cache record, while the image itself always downloads the
current upstream stable branches.

The publishing workflow passes a unique build cache-buster on every run. For a
local rebuild of unchanged repository code, use `docker buildx build --no-cache`
or pass a new `--build-arg CROWDSEC_CACHEBUST=<unique-value>` to fetch current
CrowdSec sources rather than reusing a cached download layer.

Pushes to `master` publish `latest` plus a full `sha-<commit>` tag. Git tags
publish the version tag plus the SHA tag. Pull requests build both platforms
without logging in to or publishing to GHCR.
