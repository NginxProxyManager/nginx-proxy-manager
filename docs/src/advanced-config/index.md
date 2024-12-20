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
    image: 'jc21/nginx-proxy-manager:latest'
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
    image: 'jc21/nginx-proxy-manager:latest'
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
    image: jc21/mariadb-aria
    restart: unless-stopped
    environment:
      # MYSQL_ROOT_PASSWORD: "npm"  # use secret instead
      MYSQL_ROOT_PASSWORD__FILE: /run/secrets/DB_ROOT_PWD
      MYSQL_DATABASE: "npm"
      MYSQL_USER: "npm"
      # MYSQL_PASSWORD: "npm"  # use secret instead
      MYSQL_PASSWORD__FILE: /run/secrets/MYSQL_PWD
      MARIADB_AUTO_UPGRADE: '1'
    volumes:
      - ./mysql:/var/lib/mysql
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
