## Installation and Configuration

There's a few ways to configure this app depending on:

- Whether you use `docker-compose` or vanilla docker
- Which architecture you're running it on (raspberry pi also supported - Testers wanted!)

### Configuration File

**The configuration file needs to be provided by you!**

Don't worry, this is easy to do.

The app requires a configuration file to let it know what database you're using.

Here's an example configuration for `mysql` (or mariadb):

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

Once you've created your configuration file it's easy to mount it in the docker container, examples below.

**Note:** After the first run of the application, the config file will be altered to include generated encryption keys unique to your installation. These keys
affect the login and session management of the application. If these keys change for any reason, all users will be logged out.


### Database

This app doesn't come with a database, you have to provide one yourself. Currently only `mysql/mariadb` is supported.

It's easy to use another docker container for your database also and link it as part of the docker stack. Here's an example:

```yml
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
    ports:
      - 80:80
      - 81:81
      - 443:443
    volumes:
      - ./config.json:/app/config/production.json
      - ./data:/data
      - ./letsencrypt:/etc/letsencrypt
```

Vanilla Docker:

```bash
docker run -d \
    --name nginx-proxy-manager \
    -p 80:80 \
    -p 81:81 \
    -p 443:443 \
    -v /path/to/config.json:/app/config/production.json \
    -v /path/to/data:/data \
    -v /path/to/letsencrypt:/etc/letsencrypt \
    jc21/nginx-proxy-manager:2
```


### Running on Raspberry PI / `armhf`

I have created a `armhf` docker container just for you. There may be issues with it,
if you have issues please report them here.

```bash
docker run -d \
    --name nginx-proxy-manager-app \
    -p 80:80 \
    -p 81:81 \
    -p 443:443 \
    -v /path/to/config.json:/app/config/production.json \
    -v /path/to/data:/data \
    -v /path/to/letsencrypt:/etc/letsencrypt \
    jc21/nginx-proxy-manager:2-armhf
```


### Initial Run

After the app is running for the first time, the following will happen:

- The database will initialize with table structures
- GPG keys will be generated and saved in the configuration file
- A default admin user will be created

This process can take a couple of minutes depending on your machine.


### Default Administrator User

```
Email:    admin@example.com
Password: changeme
```

Immediately after logging in with this default user you will be asked to modify your details and change your password.
