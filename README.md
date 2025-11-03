<div align="center">

# Caddy Proxy Manager

### Modern Web UI for Caddy Server

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/yourusername/caddy-proxy-manager)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![Docker](https://img.shields.io/badge/docker-ready-blue)](https://www.docker.com/)

[Website](https://caddyproxymanager.com) • [Documentation](#getting-started) • [Report Bug](https://github.com/yourusername/caddy-proxy-manager/issues) • [Request Feature](https://github.com/yourusername/caddy-proxy-manager/issues)

</div>

---

## Welcome! 👋

Caddy Proxy Manager brings a beautiful, intuitive web interface to [Caddy Server](https://caddyserver.com/), the modern web server with automatic HTTPS. Whether you're managing reverse proxies, configuring redirects, or handling SSL/TLS certificates, we've designed this tool to make your life easier.

**No complex multi-tenancy. No unnecessary bloat. Just a clean, secure, and powerful admin interface for your Caddy infrastructure.**

---

## Why Caddy Proxy Manager?

### Built for Simplicity
- **Point-and-click configuration** – No need to manually edit JSON config files or learn Caddyfile syntax
- **Works out of the box** – Deploy with Docker Compose in under 2 minutes
- **Automatic HTTPS** – Leverage Caddy's built-in ACME support with Cloudflare DNS-01 challenges
- **Visual dashboard** – Beautiful Material UI dark theme that's easy on the eyes

### Built for Control
- **Complete audit trail** – Every configuration change is logged with timestamp, actor, and details
- **Access management** – Create and assign HTTP basic-auth access lists to protect your services
- **Certificate lifecycle** – Manage ACME certificates or import your own PEM files
- **Upstream health** – Configure reverse proxy pools with custom headers and health checks

### Built for Security
- **Hardened by default** – Login throttling, strict session management, HSTS injection
- **Admin-first design** – Single admin account with production credential enforcement
- **Secure secrets** – API tokens never displayed after initial entry, restrictive file permissions
- **Modern stack** – Built on Next.js 16, React 19, and Prisma with TypeScript throughout

---

## Quick Start

### Docker Compose (Recommended)

Get up and running in 2 minutes with our Docker setup:

```bash
# 1. Clone the repository
git clone https://github.com/yourusername/caddy-proxy-manager.git
cd caddy-proxy-manager

# 2. Configure your environment
cp .env.example .env

# 3. Edit .env with secure credentials
# ADMIN_USERNAME=your-admin
# ADMIN_PASSWORD=your-strong-password-min-12-chars
# SESSION_SECRET=$(openssl rand -base64 32)

# 4. Launch the stack
docker compose up -d
```

**What you get:**
- `web` – Next.js application server with SQLite database
- `caddy` – Custom Caddy build with Cloudflare DNS and Layer4 modules

**Data persistence:**
- `./data` → Application database and imported certificates
- `./caddy-data` → ACME certificates and storage
- `./caddy-config` → Caddy runtime configuration

### Local Development

Prefer to run locally? No problem:

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env

# 3. Set your credentials in .env
# ADMIN_USERNAME=admin
# ADMIN_PASSWORD=your-password
# SESSION_SECRET=$(openssl rand -base64 32)

# 4. Start the development server
npm run dev
```

Visit `http://localhost:3000/login` and sign in with your credentials.

**Note:** Login attempts are rate-limited to 5 tries per 5 minutes. After repeated failures, wait 15 minutes before trying again.

---

## Features

### Core Modules

| Module | Description |
|--------|-------------|
| **Proxy Hosts** | Configure HTTP/HTTPS reverse proxies with upstream pools, custom headers, and Authentik forward auth |
| **Redirects** | Set up 301/302 redirects with optional query string preservation |
| **Dead Hosts** | Display branded maintenance pages with custom status codes |
| **Access Lists** | Create HTTP basic-auth user lists and assign them to proxy hosts |
| **Certificates** | Request ACME-managed certificates or import custom PEM files |
| **Settings** | Configure primary domain, ACME email, and Cloudflare DNS automation |
| **Audit Log** | Review chronological feed of all administrative actions |

### Technical Highlights

- **Next.js 16 App Router** – Server components, streaming, and server actions
- **Material UI Components** – Responsive design with dark theme
- **Direct Caddy Integration** – Generates JSON config and pushes via Caddy Admin API
- **Prisma ORM** – Type-safe database access with automatic migrations
- **SQLite Database** – Zero-configuration persistence with full ACID compliance
- **Cloudflare DNS-01** – Automated wildcard certificate issuance
- **bcrypt Authentication** – Industry-standard password hashing for access lists

---

## Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `ADMIN_USERNAME` | Admin login username | `admin` (dev only) | Yes (production) |
| `ADMIN_PASSWORD` | Admin password (min 12 chars with letters & numbers) | `admin` (dev only) | Yes (production) |
| `SESSION_SECRET` | 32+ character string for session signing | - | Yes |
| `BASE_URL` | Public URL of the dashboard | `http://localhost:3000` | No |
| `CADDY_API_URL` | Caddy Admin API endpoint | `http://caddy:2019` | No |
| `DATABASE_PATH` | SQLite file path | `/app/data/caddy-proxy-manager.db` | No |
| `PRIMARY_DOMAIN` | Default domain for Caddy config | `caddyproxymanager.com` | No |

**Production Security Requirements:**
- `ADMIN_PASSWORD` must be 12+ characters with both letters and numbers
- `SESSION_SECRET` must be 32+ characters and not a default value
- Default credentials (`admin`/`admin`) are automatically rejected

---

## Architecture

```
caddy-proxy-manager/
├── app/                        # Next.js App Router
│   ├── (auth)/                 # Authentication pages
│   ├── (dashboard)/            # Dashboard layout and feature modules
│   ├── api/                    # API routes (NextAuth, health checks)
│   ├── globals.css             # Global styles
│   └── providers.tsx           # Theme and context providers
├── src/lib/                    # Core business logic
│   ├── models/                 # Database models and operations
│   ├── caddy/                  # Caddy config generation
│   └── auth/                   # Authentication helpers
├── prisma/                     # Database schema and migrations
├── docker/
│   ├── web/                    # Next.js production Dockerfile
│   └── caddy/                  # Custom Caddy build (xcaddy + modules)
├── docker-compose.yml          # Production deployment stack
└── data/                       # Runtime data (SQLite + certificates)
```

---

## Security Features

We take security seriously. Here's what's built-in:

- **Session Secret Enforcement** – Production requires strong, unique session secrets
- **Credential Validation** – Default credentials rejected; minimum complexity enforced
- **Login Throttling** – IP + username based rate limiting (5 attempts / 5 minutes)
- **Admin-Only Mutations** – All configuration changes require admin privileges
- **Certificate Protection** – Imported certificates stored with `0600` permissions
- **Audit Trail** – Immutable log of all administrative actions
- **HSTS Headers** – Strict-Transport-Security automatically applied to managed hosts
- **Secret Redaction** – API tokens never rendered back to the browser

**Known Limitations:**
- Imported certificate keys stored in SQLite without encryption (planned enhancement)
- In-memory rate limiting (requires Redis/Memcached for multi-instance deployments)

---

## Cloudflare DNS Automation

To enable automatic SSL certificates with Cloudflare DNS-01 challenges:

1. Navigate to **Settings** in the dashboard
2. Generate a Cloudflare API token with `Zone.DNS:Edit` permissions
3. Enter your token (it's never pre-filled or displayed again for security)
4. Optionally provide Zone ID / Account ID for multi-zone setups
5. Configure ACME email address for certificate notifications

**To revoke a token:** Select "Remove existing token" in Settings and submit.

---

## Development

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Create optimized production build |
| `npm start` | Run production server |
| `npm run typecheck` | Run TypeScript type checking |

### Development Notes

- **Database:** Prisma manages schema migrations. Run `npx prisma db push` to sync changes.
- **Caddy Config:** Rebuilt on each mutation and pushed to Caddy Admin API. Errors are surfaced in the UI.
- **Rate Limiting:** Kept in-memory per Node process. For horizontal scaling, use Redis/Memcached.
- **Authentication:** Currently supports single admin user. Multi-role support requires architecture changes.

---

## Roadmap

We're actively working on these improvements:

- [ ] Encrypted storage for imported certificate private keys
- [ ] Redis/Memcached integration for distributed rate limiting
- [ ] Multi-user support with role-based access control
- [ ] Additional DNS providers (Namecheap, Route53, etc.)
- [ ] Metrics and monitoring dashboard
- [ ] Backup and restore functionality
- [ ] API for programmatic configuration

Have ideas? [Open an issue](https://github.com/yourusername/caddy-proxy-manager/issues) or submit a PR!

---

## Contributing

We welcome contributions from the community! Here's how you can help:

1. **Fork the repository**
2. **Create a feature branch** (`git checkout -b feature/amazing-feature`)
3. **Commit your changes** (`git commit -m 'Add amazing feature'`)
4. **Push to the branch** (`git push origin feature/amazing-feature`)
5. **Open a Pull Request**

### Development Guidelines

- Follow the existing code style (TypeScript, Prettier formatting)
- Add tests for new features when applicable
- Update documentation for user-facing changes
- Keep commits focused and write clear commit messages

---

## Support

Need help? We're here for you:

- **Documentation:** Check this README and inline code comments
- **Issues:** [GitHub Issues](https://github.com/yourusername/caddy-proxy-manager/issues) for bugs and feature requests
- **Discussions:** [GitHub Discussions](https://github.com/yourusername/caddy-proxy-manager/discussions) for questions and ideas

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Acknowledgments

- **[Caddy Server](https://caddyserver.com/)** – The amazing web server that powers this project
- **[Next.js](https://nextjs.org/)** – React framework for production
- **[Material UI](https://mui.com/)** – Beautiful React components
- **[Prisma](https://www.prisma.io/)** – Next-generation ORM

---

<div align="center">

Made with ❤️ by the Caddy Proxy Manager community

[⬆ back to top](#caddy-proxy-manager)

</div>
