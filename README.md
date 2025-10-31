# Caddy Proxy Manager

[https://caddyproxymanager.com](https://caddyproxymanager.com)

Caddy Proxy Manager is a modern control panel for Caddy that simplifies reverse proxy configuration, TLS automation, access control, and observability. The stack is built with Next.js 16 (App Router), Material UI, and a lightweight SQLite data layer. It ships with OAuth2 SSO, first-class Caddy admin API integration, and tooling for Cloudflare DNS challenge automation.

## Highlights

- **Next.js 16 App Router** – server components for data loading, client components for interactivity, and a unified API surface.
- **Material UI dark mode** – fast, responsive dashboard with ready-made components and accessibility baked in.
- **OAuth2 single sign-on** – PKCE flow with configurable claims; the first authenticated user is promoted to administrator.
- **End-to-end Caddy orchestration** – generate JSON for HTTP(S) proxies, redirects, 404 hosts, and TCP/UDP streams via the Caddy admin API.
- **Cloudflare DNS challenge support** – xcaddy build bundles the `cloudflare` DNS and `layer4` modules; credentials are configurable in the UI.
- **Security-by-default** – HSTS (`Strict-Transport-Security: max-age=63072000`) applied to every managed host.
- **Embedded audit log** – every configuration change is recorded with actor, summary, and timestamp.

## Project Structure

```
.
├── app/                        # Next.js App Router entrypoint (layouts, routes, server actions)
│   ├── (auth)/                 # Login + OAuth setup flows
│   ├── (dashboard)/            # Dashboard layout, feature surface, client renderers
│   ├── api/                    # Route handlers for auth callbacks/logout
│   ├── providers.tsx           # Global MUI theme + CssBaseline
│   └── layout.tsx              # Root HTML/body wrapper
├── src/
│   └── lib/                    # SQLite integration, migrations, models, Caddy config builder
├── docker/
│   ├── web/                    # Next.js production image (standalone output)
│   └── caddy/                  # xcaddy build with Cloudflare + layer4 modules
├── compose.yaml                # Multi-container deployment (Next.js app + Caddy)
├── data/                       # Generated at runtime (SQLite DB, cert storage, Caddy state)
└── README.md                   # You are here
```

### Dashboard Modules

- `ProxyHostsClient.tsx` – create/update/delete HTTP(S) reverse proxies, assign certs/access lists.
- `RedirectsClient.tsx` – manage 301/302 redirects with optional path/query preservation.
- `DeadHostsClient.tsx` – serve custom offline pages with programmable status codes.
- `StreamsClient.tsx` – configure TCP/UDP layer4 proxies.
- `AccessListsClient.tsx` – manage HTTP basic auth credentials and membership.
- `CertificatesClient.tsx` – import PEMs or request managed ACME certificates.
- `SettingsClient.tsx` – general metadata, OAuth2 endpoints, Cloudflare DNS token.
- `AuditLogClient.tsx` – list chronological administrative activity.

## Feature Overview

### Authentication & Authorization
- OAuth2/OIDC login with PKCE.
- First user bootstrap to admin role.
- Session persistence via signed, rotating cookies stored in SQLite.

### Reverse Proxy Management
- HTTP(S) proxy hosts with TLS enforcement, WebSocket + HTTP/2 toggles.
- Redirect hosts with custom status codes and query preservation.
- Dead/maintenance hosts with custom responses.
- Stream (TCP/UDP) forwarding powered by the Caddy layer4 module.
- Access list (basic auth) integration for protected hosts.
- TLS certificate lifecycle: managed ACME (DNS-01 via Cloudflare) or imported PEMs.

### Operations & Observability
- Full audit log with actor/action/summary/time.
- One-click revalidation of Caddy configuration after mutations.
- Migrations run automatically on startup; upgrades are seamless.
- Docker-first deployment, HSTS defaults, Cloudflare DNS automation.

## Requirements

- Node.js 20+ (development)
- Docker + Docker Compose v2 (deployment)
- OAuth2 identity provider (OIDC compliant preferred)
- Optional: Cloudflare DNS API token for automated certificate issuance

## Quick Start

1. **Install dependencies**

   ```bash
   npm install
   ```

   > Package downloads require network access.

2. **Run the development server**

   ```bash
   npm run dev
   ```

3. **Configure OAuth2**

   - Visit `http://localhost:3000/setup/oauth`.
   - Supply your identity provider’s authorization, token, and userinfo endpoints plus client credentials.
   - Sign in; the first user becomes an administrator.

4. **Configure Cloudflare DNS (optional)**

   - Navigate to **Settings → Cloudflare DNS**.
   - Provide an API token with `Zone.DNS:Edit` scope and the relevant zone/account IDs.
   - Any managed certificates attached to hosts will now request TLS via DNS validation.

## Docker Compose

`compose.yaml` defines a two-container stack:

- `app`: Next.js server with SQLite database and certificate store in `/data`.
- `caddy`: xcaddy-built binary with Cloudflare DNS provider and layer4 modules. The default configuration responds on `caddyproxymanager.com` and serves the required HSTS header:

  ```caddyfile
  caddyproxymanager.com {
    header Strict-Transport-Security "max-age=63072000"
    respond "Caddy Proxy Manager is running" 200
  }
  ```

Launch the stack:

```bash
docker compose up -d
```

Environment variables:

- `SESSION_SECRET`: random 32+ character string used to sign session cookies.
- `DATABASE_PATH`: path to the SQLite database (default `/data/app/app.db` in containers).
- `CERTS_DIRECTORY`: directory for imported PEM files shared with the Caddy container.
- `CADDY_API_URL`: URL for the Caddy admin API (default `http://caddy:2019` inside the compose network).
- `PRIMARY_DOMAIN`: default domain served by the bootstrap Caddyfile (defaults to `caddyproxymanager.com`).

## Data Locations

- `data/app/app.db`: SQLite database storing configuration, sessions, and audit log.
- `data/certs/`: Imported TLS certificates and keys generated by the UI.
- `data/caddy/`: Autogenerated Caddy state (ACME storage, etc.).

## UI Features

- **Proxy Hosts:** HTTP(S) reverse proxies with HSTS, access lists, optional custom certificates, and WebSocket support.
- **Redirects:** 301/302 responses with optional path/query preservation.
- **Dead Hosts:** Branded responses for offline services.
- **Streams:** TCP/UDP forwarding powered by the Caddy layer4 module.
- **Access Lists:** Bcrypt-backed basic auth credentials, assignable to proxy hosts.
- **Certificates:** Managed (ACME) or imported PEM certificates with audit history.
- **Audit Log:** Chronological record of every configuration change and actor.
- **Settings:** General metadata, OAuth2 endpoints, and Cloudflare DNS credentials.

## Development Notes

- SQLite schema migrations are embedded in `src/lib/migrations.ts` and run automatically on startup.
- Caddy configuration is rebuilt on every change and pushed via the admin API. Failures are surfaced to the UI.
- OAuth2 login uses PKCE and stores session tokens as HMAC-signed cookies backed by the database.

## License

MIT License © Caddy Proxy Manager contributors.
