# Full Setup Instructions

### MySQL Database

If you opt for the MySQL configuration you will have to provide the database server yourself. You can also use MariaDB. Here are the minimum supported versions:

- MySQL v5.7.8+
- MariaDB v10.2.7+

It's easy to use another docker container for your database also and link it as part of the docker stack, so that's what the following examples
are going to use.

::: warning

When using a `mariadb` database, the NPM configuration file should still use the `mysql` engine!

:::

### Running the App

Via `docker-compose`:

```yml
version: "3"
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
      DB_MYSQL_PASSWORD: "npm"
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
    image: 'jc21/mariadb-aria:latest'
    restart: always
    environment:
      MYSQL_ROOT_PASSWORD: 'npm'
      MYSQL_DATABASE: 'npm'
      MYSQL_USER: 'npm'
      MYSQL_PASSWORD: 'npm'
    volumes:
      - ./data/mysql:/var/lib/mysql
```

_Please note, that `DB_MYSQL_*` environment variables will take precedent over `DB_SQLITE_*` variables. So if you keep the MySQL variables, you will not be able to use Sqlite._

Then:

```bash
docker-compose up -d
```

### Running on Raspberry PI / ARM devices

The docker images support the following architectures:
- amd64
- arm64
- armv7

The docker images are a manifest of all the architecture docker builds supported, so this means
you don't have to worry about doing anything special and you can follow the common instructions above.

Check out the [dockerhub tags](https://hub.docker.com/r/jc21/nginx-proxy-manager/tags)
for a list of supported architectures and if you want one that doesn't exist,
[create a feature request](https://github.com/jc21/nginx-proxy-manager/issues/new?assignees=&labels=enhancement&template=feature_request.md&title=).

Also, if you don't know how to already, follow [this guide to install docker and docker-compose](https://manre-universe.net/how-to-run-docker-and-docker-compose-on-raspbian/)
on Raspbian.


### Initial Run

After the app is running for the first time, the following will happen:

1. The database will initialize with table structures
2. GPG keys will be generated and saved in the configuration file
3. A default admin user will be created

This process can take a couple of minutes depending on your machine.


### Default Administrator User

```
Email:    admin@example.com
Password: changeme
```

Immediately after logging in with this default user you will be asked to modify your details and change your password.

### Configuration File

::: warning

This section is meant for advanced users

:::

If you would like more control over the database settings you can define a custom config JSON file.


Here's an example for `sqlite` configuration as it is generated from the environment variables:

```json
{
  "database": {
    "engine": "knex-native",
    "knex": {
      "client": "sqlite3",
      "connection": {
        "filename": "/data/database.sqlite"
      }
    }
  }
}
```

You can modify the `knex` object with your custom configuration, but note that not all knex clients might be installed in the image.

Once you've created your configuration file you can mount it to `/app/config/production.json` inside you container using:

```
[...]
services:
  app:
    image: 'jc21/nginx-proxy-manager:latest'
    [...]
    volumes:
      - ./config.json:/app/config/production.json
      [...]
[...]
```

**Note:** After the first run of the application, the config file will be altered to include generated encryption keys unique to your installation.
These keys affect the login and session management of the application. If these keys change for any reason, all users will be logged out.
