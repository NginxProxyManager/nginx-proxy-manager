# Nginx Proxy Manager — Lorwell Fork

![Version](https://img.shields.io/badge/version-1.4.0-green.svg)
[![Docker pulls](https://img.shields.io/docker/pulls/moailaozi/nginx-proxy-manager.svg)](https://hub.docker.com/r/moailaozi/nginx-proxy-manager)

This repository is an independently maintained fork of
[Nginx Proxy Manager](https://github.com/NginxProxyManager/nginx-proxy-manager). It has its own release line,
Docker images, documentation and upgrade path. Do not use upstream release notes or upstream images when upgrading
an installation of this fork.

The project provides a web interface for running Nginx as a reverse proxy, issuing Let's Encrypt certificates and
managing access without editing Nginx configuration by hand.

## What is different in this fork

- Managed, versioned Nginx configuration with validation, preview and safe publication
- Explicit proxy directive controls and effective-configuration/source inspection
- Reusable upstream groups with multiple targets and reference protection
- Active and passive proxy-host monitoring with dashboard health state
- Live Nginx access/error log viewer
- SQLite-first local development workflow and expanded backend/frontend validation
- The original proxy hosts, redirects, streams, 404 hosts, certificates, access lists, users and audit log

## Quick start

Install Docker, then create `docker-compose.yml`:

```yaml
services:
  app:
    image: docker.io/moailaozi/nginx-proxy-manager:1.4.0
    restart: unless-stopped
    ports:
      - "80:80"
      - "81:81"
      - "443:443"
    volumes:
      - ./data:/data
      - ./letsencrypt:/etc/letsencrypt
```

Start the service:

```bash
docker compose up -d
```

Open <http://127.0.0.1:81> and create the first administrator. On slower systems the first startup can take a
minute while the database and cryptographic keys are initialized.

For production, pin a full version such as `1.4.0`. The `latest` tag follows the newest stable release of this fork,
but a pinned version makes upgrades deliberate and reversible.

## Upgrade

Back up the `data` and `letsencrypt` volumes, change the image tag to the intended version, and run:

```bash
docker compose pull
docker compose up -d
```

Database migrations run automatically at startup. Downgrades after a migration are not supported unless the data
volume is restored from a pre-upgrade backup. See the [upgrade guide](docs/src/upgrading/index.md) before upgrading.

## Documentation and support

- [Project guide](docs/src/guide/index.md)
- [Full setup](docs/src/setup/index.md)
- [Fork features](docs/src/features/index.md)
- [Advanced configuration](docs/src/advanced-config/index.md)
- [Issue tracker](https://github.com/Lorwell/nginx-proxy-manager/issues)
- [Docker image tags](https://hub.docker.com/r/moailaozi/nginx-proxy-manager/tags)

Pull requests should target the `dev` branch. Please include tests for behavior changes and keep generated API and
proxy-directive artifacts synchronized. See [CONTRIBUTING.md](CONTRIBUTING.md) for the release/version procedure.

## Attribution

This fork remains licensed under the MIT License and builds on the work of the original Nginx Proxy Manager authors
and contributors. “Nginx” is a trademark of F5, Inc.; this project is not affiliated with or endorsed by F5.
