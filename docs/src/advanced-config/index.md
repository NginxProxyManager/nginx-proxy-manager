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

## External Authentication

LDAP, SAML and OAuth/OpenID Connect providers can be added in the admin
interface under **Users → Authentication Providers**, or configured entirely
through environment variables, which is usually what you want for a container
deployed from a compose file.

Providers configured this way are recreated from the environment on every start,
appear in the interface as read only, and disappear when their variables are
removed. At most one provider of each type can be configured this way; add more
in the interface if you need them.

See [Authentication Providers](/authentication/) for what these settings mean
and how the pieces fit together.

```yml
    environment:
      AUTH_LDAP_ENABLED: "true"
      AUTH_LDAP_NAME: "Company Directory"
      AUTH_LDAP_URL: "ldaps://ldap.example.com:636"
      AUTH_LDAP_BIND_DN: "cn=readonly,dc=example,dc=com"
      AUTH_LDAP_BIND_PASSWORD: "secret"
      AUTH_LDAP_BASE_DN: "dc=example,dc=com"
      AUTH_LDAP_ADMIN_GROUP: "cn=npm-admins,ou=groups,dc=example,dc=com"
      AUTH_LDAP_AUTO_CREATE_USER: "true"
```

Any secret below can instead be supplied as a docker secret by appending
`__FILE` to the variable name and pointing it at a file, for example
`AUTH_LDAP_BIND_PASSWORD__FILE: /run/secrets/ldap_password`.

### Global

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `AUTH_DISABLE_LOCAL` | `false` | Turn off email and password sign in. Overrides the setting stored in the interface, in both directions, so it is also the way back in if you lock yourself out. |
| `AUTH_PUBLIC_URL` | derived from the request | The externally reachable base URL, used to build the redirect and callback URIs. Set this if the automatic value is wrong, for example behind another proxy. |

### Common to every provider

`<TYPE>` is one of `LDAP`, `SAML` or `OAUTH`.

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `AUTH_<TYPE>_ENABLED` | `false` | Whether to configure this provider at all |
| `AUTH_<TYPE>_NAME` | the type | Display name shown on the login screen |
| `AUTH_<TYPE>_AUTO_CREATE_USER` | `false` | Create a local account on first sign in. With this off, an administrator must create the account first and it is matched by email address. |
| `AUTH_<TYPE>_ADMIN_GROUP` | | Group or claim value that grants the admin role. Applied on every sign in, and revoked when somebody leaves the group. |
| `AUTH_<TYPE>_DEFAULT_ROLES` | | Comma separated roles given to newly created accounts |

### LDAP

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `AUTH_LDAP_URL` | | `ldap://host:389` or `ldaps://host:636` |
| `AUTH_LDAP_BIND_DN` | | Read-only service account. Leave blank to search anonymously. |
| `AUTH_LDAP_BIND_PASSWORD` | | |
| `AUTH_LDAP_BASE_DN` | | Where to search from, e.g. `dc=example,dc=com` |
| `AUTH_LDAP_USER_FILTER` | <code v-pre>(&#124;(uid={{username}})(mail={{username}}))</code> | <code v-pre>{{username}}</code> is replaced with whatever was typed into the login form |
| `AUTH_LDAP_LOGIN_ATTRIBUTES` | | Comma separated attributes accepted at the login prompt, e.g. `uid,mail,sAMAccountName`. Ignored when a user filter is set. |
| `AUTH_LDAP_EMAIL_ATTRIBUTE` | `mail` | Required. Somebody with no email address in the directory cannot sign in. |
| `AUTH_LDAP_NAME_ATTRIBUTE` | `cn` | |
| `AUTH_LDAP_NICKNAME_ATTRIBUTE` | `givenName` | |
| `AUTH_LDAP_GROUP_ATTRIBUTE` | `memberOf` | Read from the user entry, for Active Directory or OpenLDAP with the memberof overlay |
| `AUTH_LDAP_GROUP_BASE_DN` | the base DN | Where to search for groups |
| `AUTH_LDAP_GROUP_FILTER` | | Used when the user entry carries no groups, e.g. <code v-pre>(&(objectClass=groupOfNames)(member={{dn}}))</code>. <code v-pre>{{dn}}</code> and <code v-pre>{{username}}</code> are substituted. |
| `AUTH_LDAP_GROUP_NAME_ATTRIBUTE` | `dn` | |
| `AUTH_LDAP_START_TLS` | `false` | Upgrade a plain connection with StartTLS |
| `AUTH_LDAP_TLS_REJECT_UNAUTHORIZED` | `true` | Verify the server's certificate. Only turn this off for a self-signed certificate you trust. |
| `AUTH_LDAP_TIMEOUT` | `10000` | Milliseconds |
| `AUTH_LDAP_PAGE_SIZE` | `500` | Entries fetched per page, so directories past the server's result cap enumerate fully |
| `AUTH_LDAP_SYNC_ENABLED` | `false` | Walk the directory on a schedule, creating accounts before anyone signs in |
| `AUTH_LDAP_SYNC_INTERVAL` | `60` | Minutes between runs; five is the shortest allowed |
| `AUTH_LDAP_SYNC_FILTER` | `(objectClass=person)` | Which directory entries sync considers |
| `AUTH_LDAP_SYNC_GROUP` | | Only sync members of this group |
| `AUTH_LDAP_SYNC_DISABLE_MISSING` | `false` | Disable accounts whose directory entry has gone away. The last administrator is never disabled, and a run returning nothing disables nobody. |

### SAML

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `AUTH_SAML_ENTRY_POINT` | | The identity provider's sign-in URL |
| `AUTH_SAML_ISSUER` | `nginx-proxy-manager` | The entity ID this instance advertises |
| `AUTH_SAML_IDP_CERT` | | The identity provider's signing certificate |
| `AUTH_SAML_SP_PRIVATE_KEY` | | Key used to sign requests, if your IdP requires it |
| `AUTH_SAML_SIGNATURE_ALGORITHM` | `sha256` | |
| `AUTH_SAML_WANT_ASSERTIONS_SIGNED` | `true` | |
| `AUTH_SAML_WANT_AUTHN_RESPONSE_SIGNED` | `false` | Turn on if your IdP signs the response as well as the assertion |
| `AUTH_SAML_EMAIL_ATTRIBUTE` | auto-detected | Common claim URIs and short names are tried automatically |
| `AUTH_SAML_NAME_ATTRIBUTE` | auto-detected | |
| `AUTH_SAML_NICKNAME_ATTRIBUTE` | auto-detected | |
| `AUTH_SAML_GROUP_ATTRIBUTE` | auto-detected | |

### OAuth and OpenID Connect

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `AUTH_OAUTH_ISSUER_URL` | | Endpoints are discovered from here. Leave blank to configure them by hand. |
| `AUTH_OAUTH_AUTHORIZATION_URL` | discovered | |
| `AUTH_OAUTH_TOKEN_URL` | discovered | |
| `AUTH_OAUTH_USERINFO_URL` | discovered | |
| `AUTH_OAUTH_JWKS_URL` | discovered | Needed to verify ID tokens when there is no userinfo endpoint |
| `AUTH_OAUTH_CLIENT_ID` | | |
| `AUTH_OAUTH_CLIENT_SECRET` | | |
| `AUTH_OAUTH_SCOPES` | `openid email profile` | |
| `AUTH_OAUTH_EMAIL_CLAIM` | `email` | |
| `AUTH_OAUTH_NAME_CLAIM` | `name` | |
| `AUTH_OAUTH_NICKNAME_CLAIM` | `preferred_username` | |
| `AUTH_OAUTH_GROUP_CLAIM` | `groups` | |
| `AUTH_OAUTH_USE_BASIC_AUTH` | `false` | Send credentials in the Authorization header, for providers requiring `client_secret_basic` |

## Disable Nginx Resolver

On startup, we generate a resolvers directive for Nginx unless this is defined:

```yml
    environment:
      DISABLE_RESOLVER: true
```

In this configuration, all DNS queries performed by Nginx will fall to the `/etc/hosts` file
and then the `/etc/resolv.conf`.


## Changing the Admin UI port from 81 to something else

First, add an env var to your docker compose file:
```yml
    environment:
      NPM_ADMIN_PORT: '8000'
```

And you'll probably want to expose that port as well

```yml
    ports:
      - '8000:8000'
```

Then you'll be able to access admin UI at `http://localhost:8000`
