---
outline: deep
---

# Project Guide

This is the documentation for the independently maintained Lorwell fork of Nginx Proxy Manager. Its releases and
Docker images are not interchangeable with the upstream project's release line.

## Project direction

The fork keeps the approachable reverse-proxy workflow while making generated Nginx configuration observable and
controlled. A configuration can be normalized, validated and previewed before it is published. Operational features
such as reusable upstreams, proxy-host monitoring and live logs are part of this repository's supported behavior.

## Main capabilities

- Proxy hosts, redirects, TCP/UDP streams and default/404 hosts
- Let's Encrypt and custom TLS certificates
- Access lists, users, permissions and audit history
- Reusable upstream groups for multi-target proxying
- Structured Nginx proxy options with validation and effective-value inspection
- Preview and publication tracking for managed Nginx configuration
- Active/passive proxy-host monitoring and health summaries
- Live access and error log viewing from host tables

See [Fork Features](/features/) for behavior and compatibility details.

## Quick setup

Install Docker and create `docker-compose.yml`:

```yaml
services:
  app:
    image: docker.io/moailaozi/nginx-proxy-manager:1.4.0
    restart: unless-stopped
    environment:
      TZ: "Asia/Shanghai"
    ports:
      - "80:80"
      - "81:81"
      - "443:443"
    volumes:
      - ./data:/data
      - ./letsencrypt:/etc/letsencrypt
```

Run `docker compose up -d`, then open <http://127.0.0.1:81> and create the first administrator. See
[Setup Instructions](/setup/) for database choices and [Upgrading](/upgrading/) before changing image versions.

## Release and support sources

- Repository and issues: [Lorwell/nginx-proxy-manager](https://github.com/Lorwell/nginx-proxy-manager)
- Published images: [moailaozi/nginx-proxy-manager](https://hub.docker.com/r/moailaozi/nginx-proxy-manager/tags)
- Current source version: the repository's `.version` file

The administration UI checks only this fork's Docker tags for updates. Upstream `jc21/nginx-proxy-manager` tags are
not offered as upgrades.

## Contributing

Open changes against the `dev` branch. Backend schema validation, generated proxy-directive consistency, linting,
tests, locale compilation and the production frontend build must pass before an image is published.

This project remains MIT-licensed and retains attribution to the original Nginx Proxy Manager project and its
contributors.
