---
outline: deep
---

# NPM Auth Gateway

User-level access control for Nginx Proxy Manager with auto IP whitelisting.

**Repository:** [github.com/Mark0025/npm-auth-gateway](https://github.com/Mark0025/npm-auth-gateway)

## What It Does

NPM Auth Gateway is a companion app that adds user management on top of NPM's access list system. Instead of manually adding IPs to access lists, users log in through an auth provider and their IP is automatically whitelisted on the access lists they've been assigned to.

NPM remains fully in control — the gateway only reads and writes through NPM's REST API. All access enforcement stays in NPM's nginx config.

## The Problem It Solves

- **Manual IP management** — every time a user needs access, an admin manually adds their IP to an access list
- **IP changes** — mobile users, VPNs, and travel mean IPs change constantly
- **No user visibility** — access lists contain IPs, but there's no record of who each IP belongs to
- **Scaling** — managing 10+ users across multiple access lists gets tedious

## How It Works

```
Browser → NPM (SSL) → Auth Gateway → Auth Provider
                                          ↓
                                    NPM REST API (:81)
                                    auto-add IP to access lists
```

1. Admin creates a user by email
2. Admin assigns access — a table of proxy hosts with checkboxes showing which hosts each access list protects
3. User logs in → IP detected → automatically added to their assigned NPM access lists
4. User's IP changes → they log in again → new IP auto-added
5. Admin revokes access → user's IPs removed from all access lists

## Key Features

- **Auto IP whitelisting** on login
- **Per-host access control** with checkboxes (not abstract groups)
- **Admin/user roles** — admin sees everything, users see only their assigned hosts
- **Personalized dashboard** — users see their services as clickable cards
- **Login logging** with IP history per user
- **One-click revoke** — removes user's IPs from all access lists
- **Searchable tables** for proxy hosts and users
- **Survives gateway failure** — NPM keeps enforcing existing whitelists

## Architecture

| Responsibility | Who Handles It |
|---|---|
| SSL termination | **NPM** |
| Proxy host configuration | **NPM** |
| Access list enforcement | **NPM** |
| IP whitelisting | **NPM** |
| User identity | **Auth Provider** |
| User → access list mapping | **Gateway** |
| Auto IP whitelisting | **Gateway** |

**No database required.** NPM stores all proxy/ACL config. User metadata lives in the auth provider. Zero state duplication.

## NPM API Endpoints Used

| Endpoint | Purpose |
|---|---|
| `POST /api/tokens` | Authentication |
| `GET /api/nginx/proxy-hosts` | List proxy hosts |
| `GET /api/nginx/access-lists` | List access lists |
| `PUT /api/nginx/access-lists/:id` | Update access list IPs |
| `POST /api/nginx/access-lists` | Create access list |
| `GET /api/nginx/certificates` | List SSL certificates |

## Setup

See the [repository README](https://github.com/Mark0025/npm-auth-gateway) for Docker deployment instructions.

## Tech Stack

Next.js / React / TypeScript / Docker

The auth provider is swappable — the proof of concept uses Clerk, but any OIDC provider works (Auth0, Keycloak, Authentik, etc.).
