<p align="center" class="items-center">
	<img src="https://nginxproxymanager.com/github.png">
    <!---
	<br><br>
	<img src="https://img.shields.io/badge/version-2.10.3-green.svg?style=for-the-badge">
	<a href="https://hub.docker.com/r/zoeyvid/nginx-proxy-manager">
		<img src="https://img.shields.io/docker/stars/zoeyvid/nginx-proxy-manager.svg?style=for-the-badge">
	</a>
	<a href="https://hub.docker.com/r/zoeyvid/nginx-proxy-manager">
		<img src="https://img.shields.io/docker/pulls/zoeyvid/nginx-proxy-manager.svg?style=for-the-badge">
	</a>
    --->
</p>


This project comes as a pre-built docker image that enables you to easily forward to your websites
running at home or otherwise, including free TLS, without having to know too much about Nginx or Letsencrypt.

- [Quick Setup](#quick-setup)
- [Screenshots](https://nginxproxymanager.com/screenshots)


## Project Goal

I created this project to fill a personal need to provide users with a easy way to accomplish reverse
proxying hosts with TLS termination and it had to be so easy that a monkey could do it. This goal hasn't changed.
While there might be advanced options they are optional and the project should be as simple as possible
so that the barrier for entry here is low.

<!---
### Sponsor the original creator (not us):
<a href="https://www.buymeacoffee.com/jc21" target="_blank"><img src="http://public.jc21.com/github/by-me-a-coffee.png" alt="Buy Me A Coffee" style="height: 51px !important;width: 217px !important;" ></a>
--->


## Features

- Beautiful and Secure Admin Interface based on [Tabler](https://tabler.github.io)
- Easily create forwarding domains, redirections, streams and 404 hosts without knowing anything about Nginx
- Free trusted TLS certificates using Certbot (Let's Encrypt) or provide your own custom TLS certificates
- Access Lists and basic HTTP Authentication for your hosts
- Advanced Nginx configuration available for super users
- User management, permissions and audit log


# List of new features

- Supports HTTP/3 (QUIC) protocol.
- Supports CrowdSec IPS. Please see [here](https://github.com/ZoeyVid/nginx-proxy-manager#crowdsec) to enable it.
- Supports ModSecurity, with coreruleset as an option. You can configure ModSecurity/coreruleset by editing the files in the `/opt/npm/etc/modsecurity` folder.
  - If the core ruleset blocks valid requests, please check the `/data/etc/modsecurity/crs-setup.conf` file.
  - Try to whitelist the Content-Type you are sending (for example, `application/activity+json` for Mastodon and `application/dns-message` for DoH).
  - Try to whitelist the HTTP request method you are using (for example, `PUT` is blocked by default, which also affects NPM).
  - Note: To fix [this issue](https://github.com/SpiderLabs/ModSecurity/issues/2848), instead of running `nginx -s reload`, this fork kills nginx and relaunches it. This can result in a 502 error when you update your hosts
- Darkmode button in the footer for comfortable viewing (CSS done by [@theraw](https://github.com/theraw))
- Fixes proxy to https origin when the origin only accepts TLSv1.3
- Only enables TLSv1.2 and TLSv1.3 protocols
- Faster creation of TLS certificates can be achieved by eliminating unnecessary Nginx reloads and configuration creations.
- Uses OCSP Stapling for enhanced security
  - If using custom certificates, upload the CA/Intermediate Certificate (file name: `chain.pem`) in the `/opt/npm/tls/custom/npm-[certificate-id]` folder (manual migration may be needed)
- Resolved dnspod plugin issue 
  - To migrate manually, delete all dnspod certs and recreate them OR change the credentials file as per the template given [here](https://github.com/ZoeyVid/nginx-proxy-manager/blob/develop/global/certbot-dns-plugins.js)
- Smaller docker image with alpine-based distribution
- Admin backend interface runs with https
- Default page also runs with https
- Uses [fancyindex](https://gitHub.com/Naereen/Nginx-Fancyindex-Theme) if used as webserver
- Exposes INTERNAL backend api only to localhost
- Easy application of security headers using [ngx_security_headers](https://github.com/GetPageSpeed/ngx_security_headers)
- Access Log disabled
- Error Log written to console
- `Server` response header hidden
- PHP optional, with option to add extensions; available packages can be found [here](https://pkgs.alpinelinux.org/packages?branch=v3.17&repo=community&arch=x86_64&name=php81-*) and [here](https://pkgs.alpinelinux.org/packages?branch=v3.17&repo=community&arch=x86_64&name=php82-*)
- Allows different acme servers/certbot config file (/opt/npm/tls/certbot/config.ini)
- Supports up to 99 domains per cert 
- Brotli compression can be enabled
- HTTP/2 always enabled with fixed upload 
- Allows infinite upload size
- Automatic database vacuum (only sqlite)
- Automatic cleaning of old certbot certs (set FULLCLEAN to true)
- Password reset (only sqlite) using `docker exec -it nginx-proxy-manager password-reset.js USER_EMAIL PASSWORD`
- Supports TLS for MariaDB/MySQL; set `DB_MYSQL_TLS` env to true. Self-signed certificates can be uploaded to `/data/etc/npm/ca.crt` and `DB_MYSQL_CA` set to `/data/etc/npm/ca.crt` (not tested)
- Supports PUID/PGID in network mode host; add `net.ipv4.ip_unprivileged_port_start=0` at the end of `/etc/sysctl.conf`
- Option to set IP bindings for multiple instances in network mode host
- Option to change backend port
- See the composefile for all available options
- If you want to redirect all HTTP traffic to HTTPS, you can use the `compose.override.yaml` file. This will also enable `h2c` (unencrypted `HTTP/2`), while keeping `HTTP/1.0` and `HTTP/1.1`.

## Soon
- maybe redis and/or sql databases built in
- more

## migration
- **NOTE: migrating back to the original is not possible**, so make first a **backup** before migration, so you can use the backup to switch back
- if you use custom certificates, you need to upload the CA/Intermediate Certificate (file name: `chain.pem`) in the `/opt/npm/tls/custom/npm-[certificate-id]` folder
- some buttons have changed, check if they are still correct
- please delete all dnspod certs and recreate them OR you manually change the credentialsfile (see [here](https://github.com/ZoeyVid/nginx-proxy-manager/blob/develop/global/certbot-dns-plugins.js) for the template)
- since this fork has dependency on `network_mode: host`, please don't forget to open port 80 and 443 (and maybe 81) in your firewall

# Crowdsec
1. Install crowdsec: https://doc.crowdsec.net/docs/getting_started/install_crowdsec
2. make sure to use `network_mode: host` in your compose file
3. run `cscli bouncers add npm -o raw` and save the output
4. run `cscli config show --key "Config.API.Client.Credentials.URL"` and save the output
5. open `/data/etc/crowdsec/crowdsec.conf`
6. set `ENABLED` to `true`
7. use the output of step 4 as `API_KEY`
8. use the output of step 5 as `API_URL` - But remove the `/` at the end (correct: `http://127.0.0.1:8080` - incorrect: `http://127.0.0.1:8080/`)
9. make your changes
10. save the file
11. restart the npm

# Use as webserver

1. Create a new Proxy Host
2. Set `Scheme` to `https`, `Forward Hostname / IP` to `0.0.0.0`, `Forward Port` to `1` and enable `Websockets Support` (you can also use other values, since these get fully ignored)
3. Maybe set an Access List
4. Make your TLS Settings
5. 
a) Custom Nginx Configuration (advanced tab), which looks the following for file server:
- Note: the slash at the end of the file path is important
```
location / {
alias /var/www/<your-html-site-folder-name>/;
}
```
b) Custom Nginx Configuration (advanced tab), which looks the following for file server and **php**:
- Note: the slash at the end of the file path is important
- Note: first enable `PHP81` and/or `PHP82` inside your compose file
- Note: you can replace `fastcgi_pass php82;` with `fastcgi_pass` `php81`/`php82` `;`
- Note: to add more php extension use the packes from [here](https://pkgs.alpinelinux.org/packages?branch=v3.17&repo=community&arch=x86_64&name=php8*-*) and add them using the `PHP_APKS` env (see compose file)
```
location / {
alias /var/www/<your-php-site-folder-name>/;

location ~ [^/]\.php(/|$) {
fastcgi_pass php82;
fastcgi_split_path_info ^(.+?\.php)(/.*)$;
if (!-f $document_root$fastcgi_script_name) {return 404;}
}}
```

# custom acme server
1. Open this file: `nano` `/opt/npm/ssl/certbot/config.ini`
2. uncomment the server line and change it to your acme server
3. maybe set eab keys
4. create your cert using the npm web ui

# Quick Setup

1. Install Docker and Docker Compose (or portainer)

- [Docker Install documentation](https://docs.docker.com/engine)
- [Docker Compose Install documentation](https://docs.docker.com/compose/install/linux)

2. Create a compose.yaml file similar to this (or use it as a portainer stack):

```yml
version: "3"
services:
    nginx-proxy-manager:
        container_name: nginx-proxy-manager
        image: zoeyvid/nginx-proxy-manager
        restart: always
        network_mode: host
        volumes:
        - "/opt/npm:/data"
#        - "/var/www:/var/www" # optional, if you want to use it as webserver for html/php
#        - "/opt/npm-letsencrypt:/etc/letsencrypt" # Only needed for first time migration from original nginx-proxy-manager to this fork
        environment:
        - "TZ=Europe/Berlin" # set timezone, default UTC
#        - "PUID=1000" # set group id, default 0 (root)
#        - "PGID=1000" # set user id, default 0 (root)
#        - "NIBEP=48693" # internal port, always bound to 127.0.0.1, default 48693, you need to change it, if you want to run multiple npm instances in network mode host
#        - "NPM_PORT=81" # Port the NPM backend should be bound to, default 81, you need to change it, if you want to run multiple npm instances in network mode host
#        - "IPV4_BINDING=127.0.0.1" # IPv4 address to bind, defaults to all
#        - "NPM_IPV4_BINDING=127.0.0.1" # IPv4 address to bind for the NPM backend, defaults to all
#        - "IPV6_BINDING=[::1]" # IPv6 address to bind, defaults to all
#        - "NPM_IPV6_BINDING=[::1]" # IPv6 address to bind for the NPM backend, defaults to all
#        - "DISABLE_IPV6=true" # disable IPv6, incompatible with IPV6_BINDING, default false
#        - "NPM_DISABLE_IPV6=true" # disable IPv6 for the NPM backend, incompatible with NPM_IPV6_BINDING, default false
#        - "NPM_LISTEN_LOCALHOST=true" # Bind the NPM Dashboard on Port 81 only to localhost, incompatible with NPM_IPV4_BINDING/NPM_IPV6_BINDING/NPM_DISABLE_IPV6, default false
#        - "NPM_CERT_ID=1" # ID of cert, which should be used instead of dummycerts, default unset/dummycerts
#        - "DISABLE_HTTP=true" # disables nginx to listen on port 80, default false
#        - "NGINX_LOG_NOT_FOUND=true" # Allow logging of 404 errors, default false
#        - "CLEAN=false" # Clean folders, default true
#        - "FULLCLEAN=true" # Clean unused config folders, default false
#        - "PHP81=true" # Activate PHP81, default false
#        - "PHP81_APKS=php81-curl php-81-curl" # Add php extensions, see available packages here: https://pkgs.alpinelinux.org/packages?branch=v3.17&repo=community&arch=x86_64&name=php81-*, default none
#        - "PHP82=true" # Activate PHP82, default false
#        - "PHP82_APKS=php82-curl php-82-curl" # Add php extensions, see available packages here: https://pkgs.alpinelinux.org/packages?branch=v3.17&repo=community&arch=x86_64&name=php82-*, default none
```

3. Bring up your stack by running (or deploy your portainer stack)
```bash
docker compose up -d
```

4. Log in to the Admin UI

When your docker container is running, connect to it on port `81` for the admin interface.
Sometimes this can take a little bit because of the entropy of keys.
You may need to open port 81 in your firewall.
You may need to use another IP-Address.

[https://127.0.0.1:81](https://127.0.0.1:81)

Default Admin User:
```
Email:    admin@example.com
Password: iArhP1j7p1P6TA92FA2FMbbUGYqwcYzxC4AVEe12Wbi94FY9gNN62aKyF1shrvG4NycjjX9KfmDQiwkLZH1ZDR9xMjiG2QmoHXi
```

Immediately after logging in with this default user you will be asked to modify your details and change your password.


## Contributors/Sponsor original NPM

Special thanks to [all of our contributors](https://github.com/NginxProxyManager/nginx-proxy-manager/graphs/contributors).
If you want to sponsor them, please see [here](https://github.com/NginxProxyManager/nginx-proxy-manager/blob/master/README.md).


# Please report Bugs first to this fork before reporting them to the original Repository

## Getting Support

1. [Found a bug?](https://github.com/ZoeyVid/nginx-proxy-manager/issues)
2. [Discussions](https://github.com/ZoeyVid/nginx-proxy-manager/discussions)
<!---
3. [Development Gitter](https://gitter.im/nginx-proxy-manager/community)
4. [Reddit](https://reddit.com/r/nginxproxymanager)
--->
