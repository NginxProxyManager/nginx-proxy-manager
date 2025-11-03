# Caddy Proxy Manager

An admin-only control plane for driving the Caddy admin API. Manage reverse proxies, redirects, maintenance pages, certificates, and supporting access-control lists with a modern Next.js 16 dashboard.

---

## Project Status

- **Deployment model:** single administrative user (configured via environment variables)
- **Authentication:** credentials flow rate-limited to 5 attempts / 5 minutes with a 15 minute cooldown after repeated failures
- **Authorization:** all mutating actions require admin privileges; read-only pages stay accessible to the authenticated session
- **Secrets management:** Cloudflare API tokens are accepted through the UI but never rendered back to the browser; existing tokens can be revoked explicitly
- **Known limitation:** Imported certificates are stored in SQLite without encryption (planned improvement)

---

## Feature Highlights

- **Next.js 16 App Router** – hybrid server/client rendering, server actions, and streaming layouts
- **Material UI** – responsive dark-themed dashboard with polished defaults
- **Caddy integration** – generates JSON and pushes it directly to the Caddy admin API for proxies, redirects, and dead/maintenance responses
- **Certificate lifecycle** – manage ACME (Cloudflare DNS-01) or import PEM certificates; certificates written to disk with restrictive permissions
- **Access control** – bcrypt-backed HTTP basic-auth lists with assignment to proxy hosts
- **Observability** – built-in audit log records actor, action, and summary for every change
- **Security defaults** – strict session secret enforcement, mandatory credential rotation in production, HSTS injection for managed hosts, login throttling, and admin-only mutations

---

## Architecture Overview

```
.
├── app/                        # Next.js App Router (layouts, routes, server actions)
│   ├── (auth)/                 # Login experience
│   ├── (dashboard)/            # Dashboard layout, feature modules, client renderers
│   ├── api/                    # NextAuth handlers and health probe
│   ├── globals.css             # Global styles
│   └── providers.tsx           # MUI theme provider
├── src/
│   └── lib/                    # Prisma client, domain models, Caddy config builder, helpers
├── prisma/                     # Prisma schema
├── docker/
│   ├── web/                    # Next.js production image
│   └── caddy/                  # xcaddy build with Cloudflare + layer4 modules
├── docker-compose.yml          # Sample two-container deployment (Next.js + Caddy)
└── data/                       # Runtime SQLite database and certificate output
```

### Dashboard Surface

| Module | Purpose |
| --- | --- |
| Proxy Hosts | Configure HTTP(S) reverse proxies, upstream pools, headers, and Authentik forward auth support |
| Redirects | Define 301/302 redirects with optional query preservation |
| Dead Hosts | Serve branded maintenance responses with custom status codes |
| Access Lists | Create & assign HTTP basic-auth user lists |
| Certificates | Request ACME-managed or import custom PEM certificates |
| Settings | Configure primary domain, ACME email, and Cloudflare DNS automation |
| Audit Log | Review a chronological feed of administrative actions |

---

## Quick Start

### Development

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment**

   ```bash
   cp .env.example .env
   ```

   Set secure values:
   ```env
   ADMIN_USERNAME=your-admin
   ADMIN_PASSWORD=your-strong-password
   SESSION_SECRET=$(openssl rand -base64 32)
   ```

3. **Run Prisma client generation (optional in dev)**

   ```bash
   npx prisma generate
   ```

4. **Start the dev server**

   ```bash
   npm run dev
   ```

5. **Login**

   - Navigate to `http://localhost:3000/login`
   - Enter the configured credentials (remember that failed attempts are throttled)

### Docker Compose

The bundled `docker-compose.yml` spins up:

- `web`: Next.js standalone output (Node 20) with SQLite in `/app/data`
- `caddy`: xcaddy-built binary with Cloudflare DNS & layer4 modules enabled

```bash
cp .env.example .env          # set ADMIN_*/SESSION_SECRET values
docker compose up -d
```

Volumes:

- `./data` → `/app/data` (SQLite database & imported cert material)
- `./caddy-data` (Caddy ACME storage)
- `./caddy-config` (Caddy runtime config state)

---

## Configuration Reference

| Variable | Description | Default |
| --- | --- | --- |
| `ADMIN_USERNAME` | Admin login username | `admin` (development only) |
| `ADMIN_PASSWORD` | Admin login password | `admin` (development only) |
| `SESSION_SECRET` | 32+ char string for JWT/session signing | _required_ |
| `BASE_URL` | Public URL for the dashboard | `http://localhost:3000` |
| `CADDY_API_URL` | Internal Caddy admin API endpoint | `http://caddy:2019` (production container) |
| `DATABASE_PATH` | SQLite file path | `/app/data/caddy-proxy-manager.db` |
| `PRIMARY_DOMAIN` | Default domain for generated Caddy config | `caddyproxymanager.com` |

⚠️ **Production deployments must override `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and `SESSION_SECRET`.**

---

## Cloudflare DNS Automation

- Provide a Cloudflare API token with `Zone.DNS:Edit` permissions.
- The token field is rendered as a password input and never pre-filled.
- To revoke a stored token, select **Remove existing token** and submit.
- Zone ID / Account ID fields are optional but recommended for multi-zone setups.
- Managed certificates rely on valid credentials; otherwise, import PEMs manually.

---

## Security Posture

- **Session Secret Enforcement:** Production boots only when `SESSION_SECRET` is strong and not a known placeholder.
- **Admin Credential Guardrails:** Default credentials rejected at runtime; production requires 12+ char password with letters & numbers.
- **Login Throttling:** Per-IP+username throttling (5 attempts / 5 minutes, 15 minute lockout).
- **Admin-Only Mutations:** All server actions that modify state require `requireAdmin()`.
- **Certificate Handling:** Imported certificates and keys are projected to disk with `0600` permissions; certificate directory forced to `0700`. _Note: database storage for imported key material is not yet encrypted._
- **Audit Trail:** Every mutation logs actor/action/summary to SQLite.
- **Transport Security:** HSTS (`Strict-Transport-Security: max-age=63072000`) applied to managed hosts by default.

---

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Next.js in development mode |
| `npm run build` | Create production build |
| `npm start` | Run the production output |
| `npm run typecheck` | TypeScript project check |

> `npm run lint` is intentionally omitted until the lint pipeline is finalized for this workspace.

---

## Development Notes

- Prisma manages the SQLite schema. `npx prisma db push` runs during builds and entrypoint start.
- Caddy configuration is rebuilt on each mutation and pushed via the admin API; failures are surfaced to the UI with actionable errors.
- Login throttling state is kept in-memory per Node process; scale-out deployments should front the app with a shared cache (Redis/Memcached) for consistent limiting across replicas.
- The project currently supports a single administrator; introducing multi-role access will require revisiting authorization logic.

---

## Roadmap & Known Gaps

- Encrypt imported certificate material before persistence.
- Shared rate-limiting store for horizontally scaled deployments.
- Non-admin roles with scoped permissions.
- Additional DNS providers for managed certificates.

---

## License

MIT License © Caddy Proxy Manager contributors
