# Advanced Configuration

## Docker Secrets

This image supports the use of Docker secrets to import from file and keep sensitive usernames or passwords from being passed or preserved in plaintext.

You can set any environment variable from a file by appending `__FILE` (double-underscore FILE) to the environmental variable name.

```yml
version: "3.7"

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
    restart: always
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
      # If you would rather use Sqlite uncomment this
      # and remove all DB_MYSQL_* lines above
      # DB_SQLITE_FILE: "/data/database.sqlite"
      # Uncomment this if IPv6 is not enabled on your host
      # DISABLE_IPV6: 'true'
    volumes:
      - ./data:/data
      - ./letsencrypt:/etc/letsencrypt
    depends_on:
      - db
  db:
    image: jc21/mariadb-aria
    restart: always
    environment:
      # MYSQL_ROOT_PASSWORD: "npm"  # use secret instead
      MYSQL_ROOT_PASSWORD__FILE: /run/secrets/DB_ROOT_PWD
      MYSQL_DATABASE: "npm"
      MYSQL_USER: "npm"
      # MYSQL_PASSWORD: "npm"  # use secret instead
      MYSQL_PASSWORD__FILE: /run/secrets/MYSQL_PWD 
    volumes:
      - ./data/mysql:/var/lib/mysql
```


## Disabling IPv6

On some docker hosts IPv6 may not be enabled. In these cases, the following message may be seen in the log:

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

 - `/data/nginx/custom/root.conf`: Included at the very end of nginx.conf
 - `/data/nginx/custom/http.conf`: Included at the end of the main http block
 - `/data/nginx/custom/stream.conf`: Included at the end of the main stream block
 - `/data/nginx/custom/server_proxy.conf`: Included at the end of every proxy server block
 - `/data/nginx/custom/server_redirect.conf`: Included at the end of every redirection server block
 - `/data/nginx/custom/server_stream.conf`: Included at the end of every stream server block
 - `/data/nginx/custom/server_stream_tcp.conf`: Included at the end of every TCP stream server block
 - `/data/nginx/custom/server_stream_udp.conf`: Included at the end of every UDP stream server block

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
