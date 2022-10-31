<p align="center">
	<img src="https://nginxproxymanager.com/github.png">
	<br><br>
	<img src="https://img.shields.io/badge/version-2.9.15-green.svg?style=for-the-badge">
	<a href="https://hub.docker.com/repository/docker/baudneo/nginx-proxy-manager">
		<img src="https://img.shields.io/docker/stars/baudneo/nginx-proxy-manager.svg?style=for-the-badge">
	</a>
	<a href="https://hub.docker.com/repository/docker/baudneo/nginx-proxy-manager">
		<img src="https://img.shields.io/docker/pulls/baudneo/nginx-proxy-manager.svg?style=for-the-badge">
	</a>
	<a href="https://reddit.com/r/nginxproxymanager">
		<img alt="Reddit" src="https://img.shields.io/reddit/subreddit-subscribers/nginxproxymanager?label=Reddit%20Community&style=for-the-badge">
	</a>
</p>

# Trivy Scan
- [Buster-slim based image](https://trivy.dev/results/?image=baudneo/nginx-proxy-manager:latest)
- [Bullseye-slim based image](https://trivy.dev/results/?image=baudneo/nginx-proxy-manager:bullseye)
---
This project comes as a pre-built docker image that enables you to easily forward to your websites
running at home or otherwise, including free SSL, without having to know too much about Nginx or Letsencrypt.

- [Quick Setup](#quick-setup)
- [Full Setup](https://nginxproxymanager.com/setup/)
- [Screenshots](https://nginxproxymanager.com/screenshots/)

## Project Goal

I created this project to fill a personal need to provide users with a easy way to accomplish reverse
proxying hosts with SSL termination, and it had to be so easy that a monkey could do it. This goal hasn't changed.
While there might be advanced options they are optional and the project should be as simple as possible
so that the barrier for entry here is low.

<a href="https://www.buymeacoffee.com/jc21" target="_blank"><img src="http://public.jc21.com/github/by-me-a-coffee.png" alt="Buy Me A Coffee" style="height: 51px !important;width: 217px !important;" ></a>


## Features

- Beautiful and Secure Admin Interface based on [Tabler](https://tabler.github.io/)
- Easily create forwarding domains, redirections, streams and 404 hosts without knowing anything about Nginx
- Free SSL using Let's Encrypt or provide your own custom SSL certificates
- Access Lists and basic HTTP Authentication for your hosts
- Advanced Nginx configuration available for super users
- User management, permissions and audit log


## Hosting your home network

I won't go in to too much detail here but here are the basics for someone new to this self-hosted world.

1. Your home router will have a Port Forwarding section somewhere. Log in and find it
2. Add port forwarding for port 80 and 443 to the server hosting this project
3. Configure your domain name details to point to your home, either with a static ip or a service like DuckDNS or [Amazon Route53](https://github.com/jc21/route53-ddns)
4. Use the Nginx Proxy Manager as your gateway to forward to your other web based services

## Quick Setup

1. Install Docker and Docker-Compose

- [Docker Install documentation](https://docs.docker.com/install/)
- [Docker-Compose Install documentation](https://docs.docker.com/compose/install/)

2. Create a docker-compose.yml file similar to this:

```yml
version: '3'
services:
  app:
    image: 'baudneo/nginx-proxy-manager:latest'
    restart: unless-stopped
    ports:
      - '80:80'
      - '81:81'
      - '443:443'
    volumes:
      - ./data:/data
      - ./letsencrypt:/etc/letsencrypt
```

3. Bring up your stack by running

```bash
# Using docker-compose
docker-compose up -d
# Or, if you use the 'compose' plugin for docker
docker compose up -d
```

4. Log in to the Admin UI

When your docker container is running, connect to it on port `81` for the admin interface.
Sometimes this can take a little due to the entropy of keys.

[http://127.0.0.1:81](http://127.0.0.1:81)

Default Admin User:
```
Email:    admin@example.com
Password: changeme
```

Immediately after logging in with this default user you will be asked to modify your details and change your password.

# Timezone
## Environment Variables
- `TZ` - Set to your timezone. Example: `TZ=America/Chicago`

## Configuration
- Instead of setting `TZ` you can mount `/etc/localtime` into the docker container
-------
# CrowdSec OpenResty Bouncer

## NOTE
- If you don't see the bouncer hitting your local API, send a request to one of the proxied hosts in NPM. I have noticed the bouncer does not start until NPM gets a request once it is all loaded up.
- To check if the bouncer is running, use `docker logs --follow [name of your NPM container]`. There will be a log line like -> `nginx: [alert] [lua] init_by_lua:8: [Crowdsec] Initialisation done`

## Environment Variables
- `CROWDSEC_BOUNCER=1` - Enable CrowdSec OpenResty bouncer, still needs to be configured.
- `CROWDSEC_LAPI=[URL]` - configure CrowdSec local API URL
- `CROWDSEC_KEY=[API KEY]` - configure CrowdSec API key
- `CROWDSEC_RECAP_SECRET=[SECRET KEY]` - configure reCAPTCHA
- `CROWDSEC_RECAP_SITE=[SITE KEY]` - configure reCAPTCHA
- `SSL_CERTS_PATH` - CA certificate used to communicate with Google for reCAPTCHA validation
## Configuration
- Config file located at  `data/crowdsec/crowdsec-openresty-bouncer.conf`
- HTML templates are located at `/crowdsec/templates/` inside the container
- The first time the container is run, a crowdsec config file is created with ENV vars substituted out. User is responsible for config after first creation of the file.
- Set the URL and API key at a minimum. reCAPTCHA's vars if wanted.
-------
# Admin dashboard logging / OpenResty DEBUG level logging

## Environment Variables
- `ADMIN_DASHBOARD_LOG=1` - Enable admin (Port 81) dashboard logging
- `OPENRESTY_DEBUG=1` - Enable DEBUG level logging for the default OpenResty `ERROR` log

## Configuration
- Admin panel logs are located at `data/logs/admin-panel_access.log` and `data/logs/admin-panel_error.log`
- OpenResty default logs `fallback_access.log` and `fallback_error.log`. `DEBUG` level will be set on the error log, it is set to `WARN` by default.
-------
# ModSecurity
_ModSecurity WAF is installed and loaded by default, OWASP-CoreRuleSet is installed and used as the default rule set. The user is responsible for configuring modsecurity via config/CLI._

__MODSECURITY HAS KNOWN MEMORY LEAKS!__ Whenever `nginx -s reload` is issued expect RAM to increase by 10 to several hundred MB (depending on if you have custom rule files or are double enabling modsec). Nginx is reloaded every time a host is created/modified and when the SSL cert renewal timer resets. The only way to get modsec to release REAM is to restart nginx from inside the running container using `nginx -s stop; nginx -s reload` or by restarting the container using `sudo docker restart [Name of NPM container]`

## Environment Variables
- `MODSEC_CREATE=1` - Force recreating the default modsecurity config, _This should never be needed_
- `MODSEC_ADMIN_PANEL=1` - Enable ModSec for the admin panel (Port 81 web interface)
- `MODSEC_ENABLE=1` - Enable ModSec in the __ROOT__ http {} block (Enabled ModSec for ALL HTTP servers)
## The minimum directives that need to be added to enable modsec.
```
modsecurity on;
modsecurity_rules_file /etc/nginx/modsec/main.conf;
```
- See all directives -> https://github.com/SpiderLabs/ModSecurity-nginx#usage
-----
## Tips to enable
- To enable modsec for __ALL HTTP__ hosts, set MODSEC_ENABLE=1 _(Enabled in root http {} block)_
- If MODSEC_ENABLE=1. To disable modsec for __certain HTTP hosts__, add `modsecurity off;` in the Advanced tab.
- If MODSEC_ENABLE=1. To disable modsec for __certain HTTP host locations__, add `modsecurity off;` in a location {} block in the Advanced tab.
- To load __custom rules__ file, add `modsecurity_rules_file <path/to/rules/file.conf>;` in Advanced tab. Either in the root of the Advanced tab (for all locations) or inside of location {} blocks (for certain locations). __MAY INCREASE MEMORY LEAK SIZE!!!__
- **Stream hosts are unsupported**.

## Configuration
- By default, the audit log is enabled and is located at `data/logs/modsec_audit.log`
- The config and rule set are located at `data/modsec` and `data/modsec/ruleset`
- `data/modsec/modsecurity.conf` is the main modsec config file.
- `data/modsec/main.conf` is the main rules file, it has `Include` directives that load the actual rules
- `data/modsec` is symbolically linked to `/etc/nginx/modsec`
-------
# docker-compose.yaml
```
version: "3"
services:
  npm:
    image: 'baudneo/nginx-proxy-manager:latest'
    restart: always
    container_name: npm-secure
    ports:
      # Public HTTP Port:
      - '80:80'
      # Public HTTPS Port:
      - '443:443'
      # Admin Web Port:
      - '81:81'
    environment:
      # This is the default cert used to validate reCAPTCHA
      SSL_CERTS_PATH: "/etc/ssl/certs/GTS_Root_R1.pem"
      TZ: "America/Chicago"
      ADMIN_PANEL_LOG: "1"
      CROWDSEC_BOUNCER: "1"
      OPENRESTY_DEBUG: "0"

      CROWDSEC_LAPI: "http://IP TO CROWDSEC LOCAL API:8080"
      CROWDSEC_KEY: "xxxxxxxxxxxxxxxxxxxxxxxx"
      CROWDSEC_RECAP_SECRET: "XXXX"
      CROWDSEC_RECAP_SITE: "XXXX"
      # These are the settings to access your db
      DB_MYSQL_HOST: "db"
      DB_MYSQL_PORT: 3306
      DB_MYSQL_USER: "npm-user"
      DB_MYSQL_PASSWORD: "db user password"
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
    container_name: npm_db
    environment:
      MYSQL_ROOT_PASSWORD: 'xxXXxxXXXxxxXXX'
      MYSQL_DATABASE: 'npm'
      MYSQL_USER: 'npm-user'
      MYSQL_PASSWORD: "db user password"
    volumes:
      - ./data/mysql:/var/lib/mysql
```

<!-- markdownlint-enable -->
<!-- prettier-ignore-end -->
