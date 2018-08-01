## Installation and Configuration

There's a few ways to configure this app depending on:

- Whether you use `docker-compose` or vanilla docker
- Which Database you want to use (mysql or postgres)
- Which architecture you're running it on (raspberry pi also supported)

### Configuration File

**The configuration file needs to be provided by you!**

Don't worry, this is easy to do.

The app requires a configuration file to let it know what database you're using and where it is.

Here's an example configuration for `mysql`:

```json
{
  "database": {
    "engine": "mysql",
    "host": "127.0.0.1",
    "name": "nginxproxymanager",
    "user": "nginxproxymanager",
    "password": "password123",
    "port": 3306
  }
}
```

and here's one for `postgres`:

```json
{
  "database": {
    "engine": "pg",
    "version": "7.2",
    "host": "127.0.0.1",
    "name": "nginxproxymanager",
    "user": "nginxproxymanager",
    "password": "password123",
    "port": 5432
  }
}
```

Once you've created your configuration file it's easy to mount it in the docker container, examples below.

**Note:** After the first run of the application, the config file will be altered to include generated encryption keys unique to your installation. These keys
affect the login and session management of the application. If these keys change for any reason, all users will be logged out.


### Database

This app doesn't come with a database, you have to provide one yourself. Currently `mysql` and `postgres` databases are supported.

It's easy to use another docker container for your database also and link it as part of the docker stack. Here's an example:

```yml
version: "3"
services:
  app:
    image: jc21/nginx-proxy-manager:2
    restart: always
    network_mode: host
    volumes:
      - ./config.json:/app/config/production.json
      - ./data:/data
      - ./letsencrypt:/etc/letsencrypt
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
```


### Running the App

Via `docker-compose`:

```yml
version: "3"
services:
  app:
    image: jc21/nginx-proxy-manager:2
    restart: always
    network_mode: host
    volumes:
      - ./config.json:/app/config/production.json
      - ./data:/data
      - ./letsencrypt:/etc/letsencrypt
```

Vanilla Docker:

```bash
docker run -d \
    --name nginx-proxy-manager \
    --network host \
    -v /path/to/config.json:/app/config/production.json \
    -v /path/to/data:/data \
    -v /path/to/letsencrypt:/etc/letsencrypt \
    jc21/nginx-proxy-manager:2
```


### Running on Raspberry PI / `armhf`

I have created a `armhf` docker container just for you. There may be issues with it,
if you have issues please report them here.

```bash
# Postgres:
docker run -d \
    --name nginx-proxy-manager-db \
    --network host \
    -e POSTGRES_DB=nginxproxymanager \
    -e POSTGRES_USER=nginxproxymanager \
    -e POSTGRES_PASSWORD=password123 \
    -v /path/to/postgresql:/var/lib/postgresql/data \
    zsoltm/postgresql-armhf

# NPM:
docker run -d \
    --name nginx-proxy-manager-app \
    --network host \
    -v /path/to/config.json:/app/config/production.json \
    -v /path/to/data:/data \
    -v /path/to/letsencrypt:/etc/letsencrypt \
    jc21/nginx-proxy-manager:2-armhf
```
