---
outline: deep
---

# Advanced Configuration

## Running processes as a user/group

By default, the services (nginx etc) will run as `root` user inside the docker container.
You can change this behaviour by setting the following environment variables.
Not only will they run the services as this user/group, they will change the ownership
on the `data` and `letsencrypt` folders at startup.

```yml
services:
  app:
    image: 'jc21/nginx-proxy-manager:{{VERSION}}'
    environment:
      PUID: 1000
      PGID: 1000
    # ...
```

This may have the side effect of a failed container start due to permission denied trying
to open port 80 on some systems. The only course to fix that is to remove the variables
and run as the default root user.

## Best Practice: Use a Docker network

For those who have a few of their upstream services running in Docker on the same Docker
host as NPM, here's a trick to secure things a bit better. By creating a custom Docker network,
you don't need to publish ports for your upstream services to all of the Docker host's interfaces.

Create a network, ie "scoobydoo":

```bash
docker network create scoobydoo
```

Then add the following to the `docker-compose.yml` file for both NPM and any other
services running on this Docker host:

```yml
networks:
  default:
    external: true
    name: scoobydoo
```

Let's look at a Portainer example:

```yml
services:

  portainer:
    image: portainer/portainer
    privileged: true
    volumes:
      - './data:/data'
      - '/var/run/docker.sock:/var/run/docker.sock'
    restart: unless-stopped

networks:
  default:
    external: true
    name: scoobydoo
```

Now in the NPM UI you can create a proxy host with `portainer` as the hostname,
and port `9000` as the port. Even though this port isn't listed in the docker-compose
file, it's "exposed" by the Portainer Docker image for you and not available on
the Docker host outside of this Docker network. The service name is used as the
hostname, so make sure your service names are unique when using the same network.

## Docker Healthcheck

The `Dockerfile` that builds this project does not include a `HEALTHCHECK` but you can opt in to this
feature by adding the following to the service in your `docker-compose.yml` file:

```yml
healthcheck:
  test: ["CMD", "/usr/bin/check-health"]
  interval: 10s
  timeout: 3s
```

## Docker File Secrets

This image supports the use of Docker secrets to import from files and keep sensitive usernames or passwords from being passed or preserved in plaintext.

You can set any environment variable from a file by appending `__FILE` (double-underscore FILE) to the environmental variable name.

```yml
secrets:
  # Secrets are single-line text files where the sole content is the secret
  # Paths in this example assume that secrets are kept in local folder called ".secrets"
  DB_ROOT_PWD:
    file: .secrets/db_root_pwd.txt
  MYSQL_PWD:
    file: .secrets/mysql_pwd.txt

services:
  app:
    image: 'jc21/nginx-proxy-manager:{{VERSION}}'
    restart: unless-stopped
    ports:
      # Public HTTP Port:
      - '80:80'
      # Public HTTPS Port:
      - '443:443'
      # Admin Web Port:
      - '81:81'
    environment:
      # These are the settings to access your db
      DB_MYSQL_HOST: "db"
      DB_MYSQL_PORT: 3306
      DB_MYSQL_USER: "npm"
      # DB_MYSQL_PASSWORD: "npm"  # use secret instead
      DB_MYSQL_PASSWORD__FILE: /run/secrets/MYSQL_PWD
      DB_MYSQL_NAME: "npm"
      # If you would rather use Sqlite, remove all DB_MYSQL_* lines above
      # Uncomment this if IPv6 is not enabled on your host
      # DISABLE_IPV6: 'true'
    volumes:
      - ./data:/data
      - ./letsencrypt:/etc/letsencrypt
    secrets:
      - MYSQL_PWD
    depends_on:
      - db

  db:
    image: 'linuxserver/mariadb'
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD__FILE: /run/secrets/DB_ROOT_PWD
      MYSQL_DATABASE: 'npm'
      MYSQL_USER: 'npm'
      MYSQL_PASSWORD__FILE: /run/secrets/MYSQL_PWD
      TZ: 'Australia/Brisbane'
    volumes:
      - ./mariadb:/config
    secrets:
      - DB_ROOT_PWD
      - MYSQL_PWD
```


## Disabling IPv6

On some Docker hosts IPv6 may not be enabled. In these cases, the following message may be seen in the log:

> Address family not supported by protocol

The easy fix is to add a Docker environment variable to the Nginx Proxy Manager stack:

```yml
    environment:
      DISABLE_IPV6: 'true'
```

## Disabling IP Ranges Fetch

By default, NPM fetches IP ranges from CloudFront and Cloudflare during application startup. In environments with limited internet access or to speed up container startup, this fetch can be disabled:

```yml
    environment:
      IP_RANGES_FETCH_ENABLED: 'false'
```

## Custom Nginx Configurations

If you are a more advanced user, you might be itching for extra Nginx customizability.

NPM has the ability to include different custom configuration snippets in different places.

You can add your custom configuration snippet files at `/data/nginx/custom` as follow:

 - `/data/nginx/custom/root_top.conf`: Included at the top of nginx.conf
 - `/data/nginx/custom/root.conf`: Included at the very end of nginx.conf
 - `/data/nginx/custom/http_top.conf`: Included at the top of the main http block
 - `/data/nginx/custom/http.conf`: Included at the end of the main http block
 - `/data/nginx/custom/events.conf`: Included at the end of the events block
 - `/data/nginx/custom/stream.conf`: Included at the end of the main stream block
 - `/data/nginx/custom/server_proxy.conf`: Included at the end of every proxy server block
 - `/data/nginx/custom/server_redirect.conf`: Included at the end of every redirection server block
 - `/data/nginx/custom/server_stream.conf`: Included at the end of every stream server block
 - `/data/nginx/custom/server_stream_tcp.conf`: Included at the end of every TCP stream server block
 - `/data/nginx/custom/server_stream_udp.conf`: Included at the end of every UDP stream server block
 - `/data/nginx/custom/server_dead.conf`: Included at the end of every 404 server block

Every file is optional.


## X-FRAME-OPTIONS Header

You can configure the [`X-FRAME-OPTIONS`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Frame-Options) header
value by specifying it as a Docker environment variable. The default if not specified is `deny`.

```yml
  ...
  environment:
    X_FRAME_OPTIONS: "sameorigin"
  ...
```

## Customising logrotate settings

By default, NPM rotates the access- and error logs weekly and keeps 4 and 10 log files respectively.
Depending on the usage, this can lead to large log files, especially access logs.
You can customise the logrotate configuration through a mount (if your custom config is `logrotate.custom`):

```yml
  volumes:
    ...
    - ./logrotate.custom:/etc/logrotate.d/nginx-proxy-manager
```

For reference, the default configuration can be found [here](https://github.com/NginxProxyManager/nginx-proxy-manager/blob/develop/docker/rootfs/etc/logrotate.d/nginx-proxy-manager).

## Enabling the geoip2 module

To enable the geoip2 module, you can create the custom configuration file `/data/nginx/custom/root_top.conf` and include the following snippet:

```
load_module /usr/lib/nginx/modules/ngx_http_geoip2_module.so;
load_module /usr/lib/nginx/modules/ngx_stream_geoip2_module.so;
```

## Auto Initial User Creation

Setting these environment variables will create the default user on startup, skipping the UI first user setup screen:

```yml
    environment:
      INITIAL_ADMIN_EMAIL: my@example.com
      INITIAL_ADMIN_PASSWORD: mypassword1
```

## Disable Nginx Resolver

On startup, we generate a resolvers directive for Nginx unless this is defined:

```yml
    environment:
      DISABLE_RESOLVER: true
```

In this configuration, all DNS queries performed by Nginx will fall to the `/etc/hosts` file
and then the `/etc/resolv.conf`.

## OpenID Connect (OIDC) Authentication

NPM supports Single Sign-On (SSO) via OpenID Connect. When enabled, users can log in using an external identity provider (such as Authentik, Keycloak, Authelia, or any OIDC-compliant provider) instead of local credentials.

### Prerequisites

- An OIDC provider with a configured application/client.
- The provider must support the Authorization Code flow.
- A redirect URI pointing to your NPM instance: `http(s)://<npm-host>:<port>/api/oidc/callback`.

### Environment Variables

Add the following environment variables to your NPM service:

```yml
services:
  app:
    image: 'jc21/nginx-proxy-manager:{{VERSION}}'
    environment:
      # Required: The OIDC issuer URL (must be accessible from the user's browser)
      OIDC_ISSUER_URL: "https://auth.example.com/application/o/npm/"
      # Required: Client ID from your OIDC provider
      OIDC_CLIENT_ID: "your-client-id"
      # Required: Client secret from your OIDC provider
      OIDC_CLIENT_SECRET: "your-client-secret"
      # Required: Must match the redirect URI configured in your OIDC provider
      OIDC_REDIRECT_URI: "https://npm.example.com/api/oidc/callback"
      # ...
```

| Variable | Required | Description |
|---|---|---|
| `OIDC_ISSUER_URL` | Yes | The OIDC discovery URL as seen by the **browser**. Must be publicly accessible. |
| `OIDC_ISSUER_URL_INTERNAL` | No | An alternative issuer URL used by the **backend** for discovery and token exchange. Useful when NPM runs in Docker and the provider is on the same Docker network (e.g., `http://authentik:9000/application/o/npm/`). Defaults to `OIDC_ISSUER_URL`. |
| `OIDC_CLIENT_ID` | Yes | The client ID assigned by your OIDC provider. |
| `OIDC_CLIENT_SECRET` | Yes | The client secret assigned by your OIDC provider. |
| `OIDC_REDIRECT_URI` | Yes | The callback URL. Must be `http(s)://<npm-host>:<port>/api/oidc/callback` and match what is configured in your provider. |
| `OIDC_SCOPES` | No | Space or comma-separated list of scopes. Defaults to `openid profile email`. |
| `OIDC_IDENTIFIER_FIELD` | No | The claim used to match OIDC users to NPM users. Defaults to `email`. |
| `OIDC_AUTO_CREATE_USER` | No | Set to `true` to automatically create NPM users on first OIDC login. |
| `OIDC_AUTO_LOGIN` | No | Set to `true` to automatically redirect users to the OIDC provider when they visit the login page, skipping the local login form. |
| `OIDC_LOGOUT_REDIRECT_URI` | No | URL to redirect to after OIDC logout. Defaults to the NPM home page. |
| `OIDC_ALLOW_INSECURE_REQUESTS` | No | Set to `true` to allow HTTP (non-TLS) communication with the provider. **Use only for local development.** |

### Docker Network Setup

If your OIDC provider runs on the same Docker network, use `OIDC_ISSUER_URL_INTERNAL` to let the backend communicate with the provider directly via the Docker network hostname, while `OIDC_ISSUER_URL` remains the browser-accessible URL:

```yml
    environment:
      # Browser-facing URL (accessible from the client machine)
      OIDC_ISSUER_URL: "https://auth.example.com/application/o/npm/"
      # Internal Docker network URL (used by the backend for discovery & token exchange)
      OIDC_ISSUER_URL_INTERNAL: "http://authentik:9000/application/o/npm/"
```

### Example: Authentik

1. In Authentik, create an **OAuth2/OpenID Provider** with:
   - **Redirect URI:** `https://npm.example.com/api/oidc/callback`
   - **Scopes:** `openid`, `profile`, `email`
2. Create an **Application** linked to that provider.
3. Note the **Client ID** and **Client Secret**.
4. Configure NPM:

```yml
services:
  app:
    image: 'jc21/nginx-proxy-manager:{{VERSION}}'
    environment:
      OIDC_ISSUER_URL: "https://auth.example.com/application/o/npm/"
      OIDC_CLIENT_ID: "your-client-id"
      OIDC_CLIENT_SECRET: "your-client-secret"
      OIDC_REDIRECT_URI: "https://npm.example.com/api/oidc/callback"
      OIDC_AUTO_CREATE_USER: "true"
    # ...
```

Once configured, a **Sign in with OIDC** button will appear on the NPM login page.
