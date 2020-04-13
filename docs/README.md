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

2. Create a config file for example
```json
{
  "database": {
    "engine": "mysql",
    "host": "db",
    "name": "npm",
    "user": "npm",
    "password": "npm",
    "port": 3306
  }
}
```

3. Create a docker-compose.yml file similar to this:

```yml
version: '3'
services:
  app:
    image: 'jc21/nginx-proxy-manager:latest'
    ports:
      - '80:80'
      - '81:81'
      - '443:443'
    volumes:
      - ./config.json:/app/config/production.json
      - ./data:/data
      - ./letsencrypt:/etc/letsencrypt
  db:
    image: 'jc21/mariadb-aria:10.4'
    environment:
      MYSQL_ROOT_PASSWORD: 'npm'
      MYSQL_DATABASE: 'npm'
      MYSQL_USER: 'npm'
      MYSQL_PASSWORD: 'npm'
    volumes:
      - ./data/mysql:/var/lib/mysql
```

4. Bring up your stack

```bash
docker-compose up -d
```

5. Log in to the Admin UI

When your docker container is running, connect to it on port `81` for the admin interface.
Sometimes this can take a little bit because of the entropy of keys.

[http://127.0.0.1:81](http://127.0.0.1:81)

Default Admin User:

```
Email:    admin@example.com
Password: changeme
```

Immediately after logging in with this default user you will be asked to modify your details and change your password.
