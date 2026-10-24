<p align="center">
	<img src="https://nginxproxymanager.com/github.png">
	<br><br>
	<img src="https://img.shields.io/badge/version-2.9.19-green.svg?style=for-the-badge">
	<a href="https://hub.docker.com/repository/docker/jc21/nginx-proxy-manager">
		<img src="https://img.shields.io/docker/stars/jc21/nginx-proxy-manager.svg?style=for-the-badge">
	</a>
	<a href="https://hub.docker.com/repository/docker/jc21/nginx-proxy-manager">
		<img src="https://img.shields.io/docker/pulls/jc21/nginx-proxy-manager.svg?style=for-the-badge">
	</a>
</p>

This project comes as a pre-built docker image that enables you to easily forward to your websites
running at home or otherwise, including free SSL, without having to know too much about Nginx or Letsencrypt.

- [Quickest Setup](#quickest-setup)
- [Administration SSO](#administration-sso)
- [Upgrading to the SSO release](#upgrading-to-the-sso-release)
- [Local SSO Demo](#local-sso-demo)
- [Full Setup](https://nginxproxymanager.com/setup/)
- [Screenshots](https://nginxproxymanager.com/screenshots/)

## Project Goal

I created this project to fill a personal need to provide users with a easy way to accomplish reverse
proxying hosts with SSL termination and it had to be so easy that a monkey could do it. This goal hasn't changed.
While there might be advanced options they are optional and the project should be as simple as possible
so that the barrier for entry here is low.

<a href="https://www.buymeacoffee.com/jc21" target="_blank"><img src="http://public.jc21.com/github/by-me-a-coffee.png" alt="Buy Me A Coffee" style="height: 51px !important;width: 217px !important;" ></a>


## Features

- React and TypeScript admin interface based on [Tabler](https://tabler.io/)
- Easily create forwarding domains, redirections, streams and 404 hosts without knowing anything about Nginx
- Free SSL using Let's Encrypt or provide your own custom SSL certificates
- Access Lists and basic HTTP Authentication for your hosts
- Advanced Nginx configuration available for super users
- User management, permissions and audit log
- Administration login through OpenID Connect, OAuth 2.0 and SAML 2.0, with multiple connections


## Hosting your home network

I won't go in to too much detail here but here are the basics for someone new to this self-hosted world.

1. Your home router will have a Port Forwarding section somewhere. Log in and find it
2. Add port forwarding for port 80 and 443 to the server hosting this project
3. Configure your domain name details to point to your home, either with a static ip or a service like DuckDNS or [Amazon Route53](https://github.com/jc21/route53-ddns)
4. Use the Nginx Proxy Manager as your gateway to forward to your other web based services


## Quickest Setup

1. Install Docker and Docker-Compose

- [Docker Install documentation](https://docs.docker.com/install/)
- [Docker-Compose Install documentation](https://docs.docker.com/compose/install/)

2. Create a docker-compose.yml file similar to this:

```yml
version: '3'
services:
  app:
    image: 'jc21/nginx-proxy-manager:v3'
    restart: unless-stopped
    ports:
      - '80:80'
      - '81:81'
      - '443:443'
    volumes:
      - ./data:/data
```

3. Bring up your stack by running

```bash
docker compose up -d
```

4. Log in to the Admin UI

When your docker container is running, connect to it on port `81` for the admin interface.

[http://127.0.0.1:81](http://127.0.0.1:81)

## Administration SSO

Create the first local administrator and sign in before configuring SSO. These settings control login to Nginx Proxy Manager itself; they do not add authentication to applications behind Proxy Hosts.

Settings has three separate SSO menus:

| Menu | Purpose |
| --- | --- |
| **SSO - Login mode** | Choose **Password and SSO** or **SSO only**, and set the public administration URL. |
| **SSO - Connections** | Add, edit, test or remove OIDC, OAuth 2.0 and SAML 2.0 connections. Click a connection to open its editor directly below it; click it again to close. New connection forms appear above the list. |
| **SSO - Trusted emails** | Enter the complete email addresses permitted to sign in through SSO, one per line. Wildcards and domain rules are not supported. |

Set **Public administration URL** to the HTTPS origin where users access this NPM instance, for example `https://npm.example.com` or `https://localhost:8443`. Do not include a path, trailing slash, query or fragment. This is the NPM administration address, not the identity provider's website.

Configure the provider using the callback URLs displayed in the connection editor:

- **OIDC:** issuer URL, client ID, client secret, scopes and email/name claims.
- **OAuth 2.0:** authorization, token and UserInfo endpoints; client ID and secret; scopes, token authentication method and identity claims.
- **SAML 2.0:** IdP metadata URL or XML, SP entity ID and email mapping. Preview the metadata and save the reviewed configuration. Register the displayed ACS URL and SP metadata with the IdP; enable request signing if required by the provider.

An Enabled checkbox alone is insufficient: login discovery requires a valid public administration URL, valid connection configuration and stored credentials or imported SAML trust material. OIDC/OAuth connections need a client secret. SAML connections need the metadata review/import step.

Add the expected provider email to Trusted emails. An empty list denies all SSO logins. An allowed email links directly to an existing account with that email and keeps its permissions; a new account starts without permissions and displays **Waiting for access** until an administrator grants them under Users. Any enabled provider can authenticate a trusted email, including an existing administrator email.

Test sign-in in a separate browser session before switching to SSO only. That mode retains an administrator password login entry for full administrators whose password login is enabled. Back up `/data/keys/sso.key` together with the database: saved client secrets and SAML private material depend on that installation key.

Two session behaviors to plan for:

- Switching to **SSO only** blocks new password logins but does not end password sessions that are already signed in; they stay valid until they expire. Removing a trusted email or disabling a connection does revoke that email's or connection's SSO sessions immediately.
- Use the administration UI through the public administration URL. Logout from a different origin, such as `http://<host>:81`, is rejected by the server, so the browser is signed out locally but the server-side session is not revoked.

The full reference, including callback URLs, revocation rules and key restore, is in [docs/src/setup/sso.md](docs/src/setup/sso.md).

## Upgrading to the SSO release

This release changes how administrators sign in. Read this before running `docker compose pull`:

1. **Back up first.** Back up the database (and `/data/keys/sso.key` once it exists). Deploy the frontend and backend from the same release together.
2. **Every user is signed out.** Tokens issued by earlier releases have no server-side session and are rejected; users sign in again after the upgrade.
3. **Legacy OAuth login is removed.** `/oauth/login` and `/oauth/redirect` return `410`. If you used it, create and test a local full-administrator password login before upgrading, then use **Import legacy OAuth** under the SSO connections settings to convert the old configuration into a disabled draft.
4. **The upgrade can stop on duplicate or invalid emails.** Emails are now normalized (trimmed and lower-cased) and must be unique among active users. If two users normalize to the same address, for example `Admin@example.com` and `admin@example.com`, or an email is invalid, the database migration stops before changing anything, the admin UI does not load, and the backend logs a `MigrationError` containing `SSO upgrade: conflicting user IDs ...` or `SSO upgrade: user ID ... has an invalid email`. Fix or remove the affected users on the previous release (or in a restored backup), then upgrade again. No accounts are merged automatically.

See [docs/src/upgrading/index.md](docs/src/upgrading/index.md) for the general upgrade procedure.

## Local SSO Demo

The demo uses the repository's test identity providers and the running `npm.dev` development container on port `3081`. It is intended for local testing and uses fixed demo credentials and self-signed certificates; it does not connect to Google, GitHub or another external provider.

From the repository root, build the fixture image and start the demo services:

```bash
docker build -t npm-sso-fixture:task15 test/ssofixtures
docker compose -p npm-sso-demo -f docker/dev/sso-demo-compose.yml up -d
```

The services expose the administration UI at **https://localhost:8443**, OIDC at `https://host.docker.internal:9443`, OAuth 2.0 at `https://host.docker.internal:9444`, and SAML at `https://host.docker.internal:9445`. Docker Desktop must resolve `host.docker.internal` from both the host browser and containers. Accept the local test certificate prompts in the browser, or trust the demo certificates in your local test environment.

Trust the provider certificates inside the development container, then restart its backend. These commands require Bash, such as Git Bash or WSL:

```bash
for provider in oidc oauth2 saml; do
  docker exec "npm-sso-demo-${provider}-1" cat "/certs/${provider}.crt" |
    docker exec -i npm.dev sh -c "cat > /usr/local/share/ca-certificates/npm-demo-${provider}.crt"
done
docker exec npm.dev update-ca-certificates
docker exec npm.dev /command/s6-svc -r /run/service/backend
```

Compose starts the providers and HTTPS proxy; it does **not** seed NPM's database. In Settings, use **Password and SSO**, set the public administration URL to `https://localhost:8443`, and add `allowed@example.com` to Trusted emails. Add or update these three connections:

| Field | Demo - OpenID Connect | Demo - OAuth 2.0 | Demo - SAML 2.0 |
| --- | --- | --- | --- |
| Protocol | OpenID Connect | OAuth 2.0 | SAML 2.0 |
| Issuer URL | `https://host.docker.internal:9443` | — | — |
| Client ID | `npm-demo-oidc` | `npm-demo-oauth2` | — |
| Client secret | `demo-oidc-secret` | `demo-oauth2-secret` | — |
| Authorization URL | — | `https://host.docker.internal:9444/auth` | — |
| Token URL | — | `https://host.docker.internal:9444/token` | — |
| UserInfo URL | — | `https://host.docker.internal:9444/user` | — |
| Email claim | `email` | `profile.email` | — |
| Name claim | `name` | `profile.name` | — |
| Subject claim | — | `profile.subject` | — |
| Scopes | `openid email profile` | `email` | — |
| Token authentication | `client_secret_basic` | `client_secret_basic` | — |
| IdP metadata URL | — | — | `https://host.docker.internal:9445/metadata` |
| SP entity ID | — | — | `https://localhost:8443/sso/sp` |
| Email mapping | — | — | Enable email-format NameID |
| Sign authentication requests | — | — | Off |

For OIDC/OAuth, select **Replace secret** when editing an existing connection. For SAML, preview metadata before saving. Enable and save all three connections, then open **https://localhost:8443/login** in a separate browser session. Each demo provider automatically signs in as `allowed@example.com`. A newly created demo user has no permissions and reaches the waiting-for-access page; this confirms authentication without granting administrator access.

The demo certificates last approximately 24 hours. Restarting provider containers regenerates their certificates and SAML signing material: repeat the certificate trust steps and preview/save the SAML metadata again. Regenerate the administration certificate with `docker compose -p npm-sso-demo -f docker/dev/sso-demo-compose.yml run --rm certificate`, then restart the `edge` service if its certificate expires.

Stop the demo providers and HTTPS proxy with:

```bash
docker compose -p npm-sso-demo -f docker/dev/sso-demo-compose.yml down
```

This leaves the `npm.dev` container and its saved connection records intact. Disable the demo connections when the providers are stopped, and restore the public administration URL to your normal HTTPS address when finished.

## Contributors

Special thanks to [all of our contributors](https://github.com/NginxProxyManager/nginx-proxy-manager/graphs/contributors).

## Getting Support

1. [Found a bug?](https://github.com/NginxProxyManager/nginx-proxy-manager/issues)
2. [Discussions](https://github.com/NginxProxyManager/nginx-proxy-manager/discussions)
3. [Development Gitter](https://gitter.im/nginx-proxy-manager/community)
4. [Reddit](https://reddit.com/r/nginxproxymanager)

## Become a Contributor

A guide to setting up your own development environment [is found here](DEV-README.md).
