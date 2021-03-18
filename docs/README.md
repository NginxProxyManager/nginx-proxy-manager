---
home: true
heroImage: /logo.png
actionText: Get Started →
actionLink: /guide/
footer: MIT Licensed | Copyright © 2016-present jc21.com
---

<div class="features">
  <div class="feature">
    <h2>Get Connected</h2>
    <p>
      Expose web services on your network &middot;
      Free SSL with Let's Encrypt  &middot;
      Designed with security in mind  &middot;
      Perfect for home networks
    </p>
  </div>
  <div class="feature">
    <h2>Proxy Hosts</h2>
    <p>Expose your private network Web services and get connected anywhere.</p>
  </div>
  <div class="feature">
    <h2>Beautiful UI</h2>
    <p>Based on Tabler, the interface is a pleasure to use. Configuring a server has never been so fun.</p>
  </div>
  <div class="feature">
    <h2>Free SSL</h2>
    <p>Built in Let’s Encrypt support allows you to secure your Web services at no cost to you. The certificates even renew themselves!</p>
  </div>
  <div class="feature">
    <h2>Docker FTW</h2>
    <p>Built as a Docker Image, Nginx Proxy Manager only requires a database.</p>
  </div>
  <div class="feature">
    <h2>Multiple Users</h2>
    <p>Configure other users to either view or manage their own hosts. Full access permissions are available.</p>
  </div>
</div>

### Quick Setup

1. Install Docker and Docker-Compose

- [Docker Install documentation](https://docs.docker.com/install/)
- [Docker-Compose Install documentation](https://docs.docker.com/compose/install/)

2. Create a docker-compose.yml file similar to this:

```yml
version: '3'
services:
  app:
    image: 'jc21/nginx-proxy-manager:latest'
    ports:
      - '80:80'
      - '81:81'
      - '443:443'
    environment:
      DB_MYSQL_HOST: "db"
      DB_MYSQL_PORT: 3306
      DB_MYSQL_USER: "npm"
      DB_MYSQL_PASSWORD: "npm"
      DB_MYSQL_NAME: "npm"
    volumes:
      - ./data:/data
      - ./letsencrypt:/etc/letsencrypt
  db:
    image: 'jc21/mariadb-aria:latest'
    environment:
      MYSQL_ROOT_PASSWORD: 'npm'
      MYSQL_DATABASE: 'npm'
      MYSQL_USER: 'npm'
      MYSQL_PASSWORD: 'npm'
    volumes:
      - ./data/mysql:/var/lib/mysql
```

3. Bring up your stack

```bash
docker-compose up -d
```

4. Log in to the Admin UI

When your docker container is running, connect to it on port `81` for the admin interface.
Sometimes this can take a little bit because of the entropy of keys.

[http://127.0.0.1:81](http://127.0.0.1:81)

Default Admin User:

```
Email:    admin@example.com
Password: changeme
```

Immediately after logging in with this default user you will be asked to modify your details and change your password.

5. Upgrading to new versions

```bash
docker-compose pull
docker-compose up -d
```

This project will automatically update any databases or other requirements so you don't have to follow
any crazy instructions. These steps above will pull the latest updates and recreate the docker
containers.

