# Caddy Proxy Manager

[https://caddyproxymanager.com](https://caddyproxymanager.com)

Caddy Proxy Manager is a modern control panel for Caddy that simplifies reverse proxy configuration, TLS automation, access control, and observability. The stack is built with Next.js 16 (App Router), Material UI, and a lightweight SQLite data layer. It features simple username/password authentication, first-class Caddy admin API integration, and tooling for Cloudflare DNS challenge automation.

## Highlights

- **Next.js 16 App Router** – server components for data loading, client components for interactivity, and a unified API surface.
- **Material UI dark mode** – fast, responsive dashboard with ready-made components and accessibility baked in.
- **Simple authentication** – environment-based username/password login configured via docker-compose.
- **End-to-end Caddy orchestration** – generate JSON for HTTP(S) proxies, redirects, 404 hosts via the Caddy admin API.
- **Cloudflare DNS challenge support** – xcaddy build bundles the `cloudflare` DNS and `layer4` modules; credentials are configurable in the UI.
- **Security-by-default** – HSTS (`Strict-Transport-Security: max-age=63072000`) applied to every managed host.
- **Embedded audit log** – every configuration change is recorded with actor, summary, and timestamp.

## Project Structure

```
.
├── app/                        # Next.js App Router entrypoint (layouts, routes, server actions)
│   ├── (auth)/                 # Login flow
│   ├── (dashboard)/            # Dashboard layout, feature surface, client renderers
│   ├── api/                    # Route handlers for auth callbacks/logout
│   ├── providers.tsx           # Global MUI theme + CssBaseline
│   └── layout.tsx              # Root HTML/body wrapper
├── src/
│   └── lib/                    # SQLite integration, models, Caddy config builder
├── docker/
│   ├── web/                    # Next.js production image (standalone output)
│   └── caddy/                  # xcaddy build with Cloudflare + layer4 modules
├── docker-compose.yml          # Multi-container deployment (Next.js app + Caddy)
├── data/                       # Generated at runtime (SQLite DB, cert storage, Caddy state)
└── README.md                   # You are here
```

### Dashboard Modules

- `ProxyHostsClient.tsx` – create/update/delete HTTP(S) reverse proxies, assign certs/access lists.
- `RedirectsClient.tsx` – manage 301/302 redirects with optional path/query preservation.
- `DeadHostsClient.tsx` – serve custom offline pages with programmable status codes.
- `AccessListsClient.tsx` – manage HTTP basic auth credentials and membership.
- `CertificatesClient.tsx` – import PEMs or request managed ACME certificates.
- `SettingsClient.tsx` – general metadata and Cloudflare DNS token configuration.
- `AuditLogClient.tsx` – list chronological administrative activity.

## Feature Overview

### Authentication & Authorization
- Simple username/password authentication configured via environment variables.
- Credentials set in docker-compose or `.env` file.
- Session persistence via signed JWT tokens.

### Reverse Proxy Management
- HTTP(S) proxy hosts with TLS enforcement, WebSocket + HTTP/2 toggles.
- Redirect hosts with custom status codes and query preservation.
- Dead/maintenance hosts with custom responses.
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
- Optional: Cloudflare DNS API token for automated certificate issuance

## Quick Start

### Development

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Create environment file**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` and set your admin credentials:
   ```env
   ADMIN_USERNAME=your-username
   ADMIN_PASSWORD=your-secure-password
   SESSION_SECRET=your-random-secret-here
   ```

3. **Run the development server**

   ```bash
   npm run dev
   ```

4. **Login**

   - Visit `http://localhost:3000/login`
   - Enter your configured username and password
   - You're now logged in as administrator

5. **Configure Cloudflare DNS (optional)**

   - Navigate to **Settings → Cloudflare DNS**.
   - Provide an API token with `Zone.DNS:Edit` scope and the relevant zone/account IDs.
   - Any managed certificates attached to hosts will now request TLS via DNS validation.

### Production Deployment

## Docker Compose

`docker-compose.yml` defines a two-container stack:

- `web`: Next.js server with SQLite database and certificate store in `/data`.
- `caddy`: xcaddy-built binary with Cloudflare DNS provider and layer4 modules.

Launch the stack:

```bash
# Create .env file with your credentials
cp .env.example .env

# Edit .env and set secure values for:
# - ADMIN_USERNAME
# - ADMIN_PASSWORD
# - SESSION_SECRET

# Start the containers
docker compose up -d
```

### Environment Variables

**Required (Security):**

- `SESSION_SECRET`: Random 32+ character string used to sign session tokens. Generate with: `openssl rand -base64 32`
- `ADMIN_USERNAME`: Username for admin login (default: `admin`)
- `ADMIN_PASSWORD`: Password for admin login (default: `admin`)

**Optional (Application):**

- `BASE_URL`: Public base URL for the application (default: `http://localhost:3000`)
- `PRIMARY_DOMAIN`: Default domain served by Caddy (default: `caddyproxymanager.com`)
- `CADDY_API_URL`: URL for the Caddy admin API (default: `http://caddy:2019`)
- `DATABASE_PATH`: Path to the SQLite database (default: `/app/data/caddy-proxy-manager.db`)

⚠️ **Important**: Always change the default `ADMIN_USERNAME` and `ADMIN_PASSWORD` in production!

## Data Locations

- `data/caddy-proxy-manager.db`: SQLite database storing configuration, sessions, and audit log.
- `data/certs/`: Imported TLS certificates and keys generated by the UI.
- `caddy-data/`: Autogenerated Caddy state (ACME storage, etc.).
- `caddy-config/`: Caddy configuration storage.

## UI Features

- **Proxy Hosts:** HTTP(S) reverse proxies with HSTS, access lists, optional custom certificates, and WebSocket support.
- **Redirects:** 301/302 responses with optional path/query preservation.
- **Dead Hosts:** Branded responses for offline services.
- **Access Lists:** Bcrypt-backed basic auth credentials, assignable to proxy hosts.
- **Certificates:** Managed (ACME) or imported PEM certificates with audit history.
- **Audit Log:** Chronological record of every configuration change and actor.
- **Settings:** General metadata and Cloudflare DNS credentials.

## Development Notes

- SQLite schema migrations are embedded and run automatically on startup via Prisma.
- Caddy configuration is rebuilt on every change and pushed via the admin API. Failures are surfaced to the UI.
- Authentication uses NextAuth.js with JWT session strategy.
- Type checking: `npm run typecheck`
- Build: `npm run build`

## Security Considerations

1. **Change default credentials**: Never use `admin/admin` in production
2. **Use strong SESSION_SECRET**: Generate with `openssl rand -base64 32`
3. **Use HTTPS in production**: Configure BASE_URL with `https://` protocol
4. **Restrict network access**: Ensure port 3000 is only accessible via reverse proxy
5. **Keep updated**: Regularly update dependencies and Docker images

## License

MIT License © Caddy Proxy Manager contributors.
