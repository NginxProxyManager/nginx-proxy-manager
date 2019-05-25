## Importing from Version 1

Thanks for using Nginx Proxy Manager version 1. It sucked.

But it worked.

This guide will let your import your configuration from version 1 to version 2.

**IMPORTANT: This will make changes to your `letsencrypt` folder and certificate files!** Make sure you back them up first.


### Link your previous folders in your new docker stack

In version 1, the docker configuration asked for a `config` folder to be linked and a `letsencrypt` folder. However in version 2, the
configuration exists in the database, so the `config` folder is no longer required. However if you have this folder linked in a
version 2 stack, the application will automatically import that configuration the first time it finds it.

Following the [example configuration](../example):

```yaml
version: "3"
services:
  app:
    image: jc21/nginx-proxy-manager:2
    restart: always
    ports:
      - 80:80
      - 81:81
      - 443:443
    volumes:
      - ./config.json:/app/config/production.json
      - ./data:/data
      - ./letsencrypt:/etc/letsencrypt  # this is your previous letsencrypt folder
      - ./config:/config                # this is your previous config folder
    depends_on:
      - db
  db:
    image: mariadb
    restart: always
    environment:
      MYSQL_ROOT_PASSWORD: "password123"
      MYSQL_DATABASE: "nginxproxymanager"
      MYSQL_USER: "nginxproxymanager"
      MYSQL_PASSWORD: "password123"
    volumes:
      - ./data/mysql:/var/lib/mysql
  letsencrypt:
    image: adferrand/letsencrypt-dns
    container_name: "letsencrypt-dns"
    env_file: .env
    volumes:
      - "$ROOT/domains.conf:/etc/letsencrypt/domains.conf"
      - "$ROOT/certs/:/etc/letsencrypt"
    environment:
      - VERSION=latest
      - "LETSENCRYPT_USER_MAIL=$EMAIL"
      - "LEXICON_PROVIDER=$PROVIDER"
      - "LEXICON_PROVIDER_OPTIONS=$PROVIDER_OPTIONS"
      - "CERTS_DIRS_MODE=$DIRS_MODE"
      - "CERTS_FILES_MODE=$FILES_MODE"
    restart: always      
```

After you start the stack, the import will begin just after database initialize.

Some notes:
- After importing, a file is created in the `config` folder to signify that it has been imported and should not be imported again.
- Because no users previously existed in the version 1 config, the `admin@example.com` user will own all of the imported data.
- If you were crazy like me and used Nginx Proxy Manager version 1 to proxy the Admin interface behind a Access List, you should
really disable the access list for that proxy host in version 1 before importing in to version 2. The app doesn't like being behind basic
authentication and it's own internal authentication. If you forgot to do this before importing, just hit the admin interface directly
on port 81 to get around your basic authentication access list.
