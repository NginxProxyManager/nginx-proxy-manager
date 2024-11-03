# NPMplus

This project comes as a pre-built docker image that enables you to easily forward to your websites
running at home or otherwise, including free TLS, without having to know too much about Nginx or Certbot.

- [Quick Setup](#quick-setup)

**Note: NO armv7, route53 and aws cloudfront ip ranges support.** <br>
**Note: Other Databases like MariaDB may work, but are unsupported.** <br>
**Note: watchtower does NOT update NPMplus, you need to do it yourself (it will only pull the image, but not update the container itself).** <br>
**Note: access.log/stream.log, logrotate and goaccess are NOT enabled by default bceuase of GDPR, you can enable them in the compose.yaml.** <br>

**Note: add `net.ipv4.ip_unprivileged_port_start=0` at the end of `/etc/sysctl.conf` to support PUID/PGID in network mode host.** <br>
**Note: Don't forget to open Port 80 (tcp) and 443 (tcp AND udp, http3/quic needs udp) in your firewall (because of network mode host, you also need to open this ports in ufw, if you use ufw).** <br>
**Note: If you don't use network mode host, which I don't recommend, don't forget to also expose port 443/udp (http3/quic needs udp), to enable IPv6 in Docker see step 1 and 2 [here](https://github.com/nextcloud/all-in-one/blob/main/docker-ipv6-support.md).** <br>


## Project Goal
I created this project to fill a personal need to provide users with an easy way to accomplish reverse
proxying hosts with TLS termination and it had to be so easy that a monkey could do it. This goal hasn't changed.
While there might be advanced options they are optional and the project should be as simple as possible
so that the barrier for entry here is low.

## Features

- Beautiful and Secure Admin Interface based on [Tabler](https://tabler.github.io)
- Easily create forwarding domains, redirections, streams and 404 hosts without knowing anything about Nginx
- Free trusted TLS certificates using Certbot (Let's Encrypt/other CAs) or provide your own custom TLS certificates
- Access Lists and basic HTTP Authentication for your hosts
- Advanced Nginx configuration available for super users
- User management, permissions and audit log


# List of new features

- Supports HTTP/3 (QUIC) protocol.
- Supports CrowdSec IPS. Please see [here](https://github.com/ZoeyVid/NPMplus#crowdsec) to enable it.
- goaccess included, see compose.yaml to enable, runs by default on https://<ip>:91 (nginx config from [here](https://github.com/xavier-hernandez/goaccess-for-nginxproxymanager/blob/main/resources/nginx/nginx.conf))
- Supports ModSecurity, with coreruleset as an option. You can configure ModSecurity/coreruleset by editing the files in the `/opt/npm/etc/modsecurity` folder (no support from me, you need to write the rules yourself - for CRS I can try to help you).
  - ModSecurity by default blocks uploads of big files, you need to edit its config to fix this, but it can use a lot of resources to scan big files by ModSecurity
  - ModSecurity overblocking (403 Error) with CRS? Please see [here](https://coreruleset.org/docs/concepts/false_positives_tuning) and edit the `/opt/npm/etc/modsecurity/crs-setup.conf` file.
  - Try to whitelist the Content-Type you are sending (for example, `application/activity+json` for Mastodon and `application/dns-message` for DoH).
  - Try to whitelist the HTTP request method you are using (for example, `PUT` is blocked by default, which also affects NPM).
  - CRS plugins are supported, you can find a guide in this readme
- Darkmode button in the footer for comfortable viewing (CSS done by [@theraw](https://github.com/theraw))
- Fixes proxy to https origin when the origin only accepts TLSv1.3
- Only enables TLSv1.2 and TLSv1.3 protocols, also ML-KEM support
- Faster creation of TLS certificates is achieved by eliminating unnecessary nginx reloads and configuration creations.
- Uses OCSP Stapling for enhanced security (manual certs not supported)
- Resolved dnspod plugin issue
  - To migrate manually, delete all dnspod certs and recreate them OR change the credentials file as per the template given [here](https://github.com/ZoeyVid/NPMplus/blob/develop/global/certbot-dns-plugins.js)
- Smaller docker image with alpine-based distribution
- Admin backend interface runs with https
- Default page also runs with https
- option to change default TLS cert
- Uses [fancyindex](https://gitHub.com/Naereen/Nginx-Fancyindex-Theme) if used as webserver
- Exposes INTERNAL backend api only to localhost
- Basic security headers are added if you enable HSTS (HSTS has always subdomains and preload enabled)
- access.log is disabled by default, unified and moved to `/opt/npm/nginx/access.log`
- Error Log written to console
- `Server` response header hidden
- PHP 8.2/8.3 optional, with option to add extensions; available packages can added using envs in the compose file
- Allows different acme servers using env
- Supports up to 99 domains per cert
- Brotli compression can be enabled
- HTTP/2 always enabled with fixed upload
- Allows infinite upload size (may be limited if you use ModSecurity)
- Automatic database vacuum (only sqlite)
- Automatic cleaning of old invalid certbot certs (set CLEAN to true)
- Password reset (only sqlite) using `docker exec -it npmplus password-reset.js USER_EMAIL PASSWORD`
- Supports TLS for MariaDB/MySQL; set `DB_MYSQL_TLS` env to true. Self-signed certificates can be uploaded to `/opt/npm/etc/npm/ca.crt` and `DB_MYSQL_CA` set to `/data/etc/npm/ca.crt` (not tested, unsupported)
- multi lang support, if you want to add an language, see this commit as an example: https://github.com/ZoeyVid/NPMplus/commit/a026b42329f66b89fe1fbe5e6034df5d3fc2e11f (implementation based on [@lateautumn233](https://github.com/lateautumn233) fork)
- See the compose file for all available options
- many env options optimized for network_mode host (ports/ip bindings)
- allow port range in streams
- fixed smaller issues/bugs
- other small changes/improvements

## migration
- **NOTE: migrating back to the original is not possible**, so make first a **backup** before migration, so you can use the backup to switch back
- please delete all dnspod certs and recreate them after migration OR you manually change the credentialsfile (see [here](https://github.com/ZoeyVid/npmplus/blob/develop/global/certbot-dns-plugins.json) for the template)
- stop nginx-proxy-manager download the latest compose.yaml, adjust your paths (of /etc/letsencrypt and /data) to the ones you used with nginx-proxy-manager and adjust the env of the compose file how you like it and then deploy it
- you can now remove the /etc/letsencrypt mount, since it was moved to /data while migration and redeploy the compose file
- since this fork uses  `network_mode: host` by default (and all guides are written for this mode), please don't forget to open port 80/tcp, 443/tcp and 443/udp (and maybe 81/tcp) in your firewall
- since many buttons changed, please edit every host you have and click save. (Please also resave it, if all buttons/values are fine, to update the host config to fully fit the NPMplus template)
- maybe setup crowdsec (see below)
- please report all (migration) issues you may have

# Quick Setup
1. Install Docker and Docker Compose (or portainer)
- [Docker Install documentation](https://docs.docker.com/engine)
- [Docker Compose Install documentation](https://docs.docker.com/compose/install/linux)
2. Download this [compose.yaml](https://raw.githubusercontent.com/ZoeyVid/NPMplus/refs/heads/develop/compose.yaml) (or use its content as a portainer stack)
3. adjust TZ and ACME_EMAIL to your values and maybe adjust other env options to your needs.
4. start NPMplus by running (or deploy your portainer stack)
```bash
docker compose up -d
```
5. Log in to the Admin UI
When your docker container is running, connect to it on port `81` for the admin interface.
Sometimes this can take a little bit because of the entropy of keys.
You may need to open port 81 in your firewall.
You may need to use another IP-Address.
[https://127.0.0.1:81](https://127.0.0.1:81)
Default Admin User:
```
Email:    admin@example.org
Password: iArhP1j7p1P6TA92FA2FMbbUGYqwcYzxC4AVEe12Wbi94FY9gNN62aKyF1shrvG4NycjjX9KfmDQiwkLZH1ZDR9xMjiG2QmoHXi
```
Immediately after logging in with this default user you will be asked to modify your details and change your password.

# Crowdsec
Note: Using Immich behind NPMplus with enabled appsec causes issues, see here: [#1241](https://github.com/ZoeyVid/NPMplus/discussions/1241)
1. set LOGROTATE to `true` in your `compose.yaml` and redeploy
2. Install crowdsec using this compose file: https://github.com/ZoeyVid/NPMplus/blob/develop/compose.crowdsec.yaml and set the timezone for it
3. open `/opt/crowdsec/conf/acquis.d/npmplus.yaml` and fill it with:
```yaml
filenames:
  - /opt/npm/nginx/access.log
labels:
  type: npmplus
---
source: docker
container_name:
 - npmplus
labels:
  type: npmplus
---
source: docker
container_name:
 - npmplus
labels:
  type: modsecurity
---
listen_addr: 0.0.0.0:7422
appsec_config: crowdsecurity/appsec-default
name: appsec
source: appsec
labels:
  type: appsec
```
4. make sure to use `network_mode: host` in your compose file
5. run `docker exec crowdsec cscli bouncers add npmplus -o raw` and save the output
6. open `/opt/npm/etc/crowdsec/crowdsec.conf`
7. set `ENABLED` to `true`
8. use the output of step 5 as `API_KEY`
9. save the file
10. redeploy the `compose.yaml`

# coreruleset plugins
1. Download the plugin (all files inside the `plugins` folder of the git repo), most time: `<plugin-name>-before.conf`, `<plugin-name>-config.conf` and `<plugin-name>-after.conf` and sometimes `<plugin-name>.data` and/or `<plugin-name>.lua` or somilar files
2. put them into the `/opt/npm/etc/modsecurity/crs-plugins` folder
3. maybe open the `/opt/npm/etc/modsecurity/crs-plugins/<plugin-name>-config.conf` and configure the plugin

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
    include conf.d/include/always.conf;
    alias /var/www/<your-html-site-folder-name>/;
    fancyindex off; # alternative to nginxs "index" option (looks better and has more options)
}
```
b) Custom Nginx Configuration (advanced tab), which looks the following for file server and **php**:
- Note: the slash at the end of the file path is important
- Note: first enable `PHP82` and/or `PHP83` inside your compose file
- Note: you can replace `fastcgi_pass php82;` with `fastcgi_pass php83;`
- Note: to add more php extension using envs you can set in the compose file
```
location / {
    include conf.d/include/always.conf;
    alias /var/www/<your-html-site-folder-name>/;
    fancyindex off; # alternative to nginxs "index" option (looks better and has more options)

    location ~ [^/]\.php(/|$) {
        fastcgi_pass php82;
        fastcgi_split_path_info ^(.+?\.php)(/.*)$;
        if (!-f $document_root$fastcgi_script_name) {
            return 404;
        }
    }
}
```

### prerun scripts (EXPERT option) - if you don't know what this is, ignore it
run order: entrypoint.sh (prerun scripts) => start.sh => launch.sh <br>
if you need to run scripts before NPMplus launches put them under: `/opt/npm/etc/prerun/*.sh` (please add `#!/bin/sh` / `#!/bin/bash` to the top of the script) <br>
you need to create this folder yourself - **NOTE:** I won't help you creating those patches/scripts if you need them you also need to know how to create them

## Contributing
All are welcome to create pull requests for this project.

# Please report Bugs first to this fork before reporting them to the upstream Repository
## Getting Help
1. [Support/Questions](https://github.com/ZoeyVid/NPMplus/discussions)
2. [Reddit](https://reddit.com/r/NPMplus)
3. [Bugs](https://github.com/ZoeyVid/NPMplus/issues)
