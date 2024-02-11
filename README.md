# NPMplus

This project comes as a pre-built docker image that enables you to easily forward to your websites
running at home or otherwise, including free TLS, without having to know too much about Nginx or Certbot.

- [Quick Setup](#quick-setup)
<!---
- [Screenshots](https://nginxproxymanager.com/screenshots)
--->

<!---
**Note: To fix [this issue](https://github.com/SpiderLabs/ModSecurity/issues/2848), instead of running `nginx -s reload`, this fork stops nginx and starts it again. This can result in a 502 error when you update your hosts. See https://github.com/ZoeyVid/NPMplus/issues/296 and https://github.com/ZoeyVid/NPMplus/issues/283.** <br>
--->
**Note: Reloading the NPMplus UI can cause a 502 error. See https://github.com/ZoeyVid/NPMplus/issues/241.** <br>
**Note: NO armv7 and route53 support.** <br>
**Note: add `net.ipv4.ip_unprivileged_port_start=0` at the end of `/etc/sysctl.conf` to support PUID/PGID in network mode host.** <br>
**Note: If you don't use network mode host, which I don't recommend, don't forget to expose port 443 on tcp AND udp (http3/quic needs udp).** <br>
**Note: If you don't use network mode host, which I don't recommend, don't forget to enable IPv6 in Docker, see [here](https://github.com/nextcloud/all-in-one/blob/main/docker-ipv6-support.md), you only need to edit the daemon.json and restart docker, if you use the bridge network, otherwise please enable IPv6 in your custom docker network!** <br>
**Note: Don't forget to open Port 80 (tcp) and 443 (tcp AND udp, http3/quic needs udp) in your firewall (because of network mode host, you also need to open this ports in ufw, if you use ufw).** <br>
**Note: ModSecurity overblocking (403 Error)? Please see `/opt/npm/etc/modsecurity`, if you also use CRS please see [here](https://coreruleset.org/docs/concepts/false_positives_tuning).** <br>
**Note: Internal/LAN Instance? Please disable `must-staple` in `/opt/npm/tls/certbot/config.ini` before creating your certificates.** <br>
**Note: Other Databases like MariaDB may work, but are unsupported.** <br>
**Note: access.log/stream.log, logrotate and goaccess are NOT enabled by default bceuase of GDPR, you can enable them in the compose.yaml.** <br>


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
- Free trusted TLS certificates using Certbot (Let's Encrypt/other CAs) or provide your own custom TLS certificates
- Access Lists and basic HTTP Authentication for your hosts
- Advanced Nginx configuration available for super users
- User management, permissions and audit log


# List of new features

- Supports HTTP/3 (QUIC) protocol.
- Supports CrowdSec IPS. Please see [here](https://github.com/ZoeyVid/NPMplus#crowdsec) to enable it.
- goaccess included, see compose.yaml to enable, runs by default on https://<ip>:91 (nginx config from [here](https://github.com/xavier-hernandez/goaccess-for-nginxproxymanager/blob/main/resources/nginx/nginx.conf))
- Supports ModSecurity, with coreruleset as an option. You can configure ModSecurity/coreruleset by editing the files in the `/opt/npm/etc/modsecurity` folder.
  - If the core ruleset blocks valid requests, please check the `/opt/npm/etc/modsecurity/crs-setup.conf` file.
  - Try to whitelist the Content-Type you are sending (for example, `application/activity+json` for Mastodon and `application/dns-message` for DoH).
  - Try to whitelist the HTTP request method you are using (for example, `PUT` is blocked by default, which also affects NPM).
<!---
  - Note: To fix [this issue](https://github.com/SpiderLabs/ModSecurity/issues/2848), instead of running `nginx -s reload`, this fork stops nginx and starts it again. This will result in a 502 error when you update your hosts. See https://github.com/ZoeyVid/NPMplus/issues/296 and https://github.com/ZoeyVid/NPMplus/issues/283.
--->
- Darkmode button in the footer for comfortable viewing (CSS done by [@theraw](https://github.com/theraw))
- Fixes proxy to https origin when the origin only accepts TLSv1.3
- Only enables TLSv1.2 and TLSv1.3 protocols
- Faster creation of TLS certificates can be achieved by eliminating unnecessary Nginx reloads and configuration creations.
- Uses OCSP Stapling for enhanced security
  - If using custom certificates, upload the CA/Intermediate Certificate (file name: `chain.pem`) in the `/opt/npm/tls/custom/npm-[certificate-id]` folder (manual migration may be needed)
- Resolved dnspod plugin issue
  - To migrate manually, delete all dnspod certs and recreate them OR change the credentials file as per the template given [here](https://github.com/ZoeyVid/NPMplus/blob/develop/global/certbot-dns-plugins.js)
- Smaller docker image with alpine-based distribution
- Admin backend interface runs with https
- Default page also runs with https
- Uses [fancyindex](https://gitHub.com/Naereen/Nginx-Fancyindex-Theme) if used as webserver
- Exposes INTERNAL backend api only to localhost
- Basic security headers are added if you enable HSTS (HSTS has always subdomains and preload enabled)
- access.log is disabled by default, unified and moved to `/opt/npm/nginx/access.log`
- Error Log written to console
- `Server` response header hidden
- PHP 8.1/8.2/8.3 optional, with option to add extensions; available packages can added using envs in the compose file
- Allows different acme servers/certbot config file (/opt/npm/tls/certbot/config.ini)
- Supports up to 99 domains per cert
- Brotli compression can be enabled
- HTTP/2 always enabled with fixed upload
- Allows infinite upload size
- Automatic database vacuum (only sqlite)
- Automatic cleaning of old certbot certs (set FULLCLEAN to true)
- Password reset (only sqlite) using `docker exec -it npmplus password-reset.js USER_EMAIL PASSWORD`
- Supports TLS for MariaDB/MySQL; set `DB_MYSQL_TLS` env to true. Self-signed certificates can be uploaded to `/opt/npm/etc/npm/ca.crt` and `DB_MYSQL_CA` set to `/data/etc/npm/ca.crt` (not tested, unsupported)
- Supports PUID/PGID in network mode host; add `net.ipv4.ip_unprivileged_port_start=0` at the end of `/etc/sysctl.conf`
- Option to set IP bindings for multiple instances in network mode host
- Option to change backend port
- See the composefile for all available options
- If you want to redirect all HTTP traffic to HTTPS, you can use the `compose.override.yaml` file.

## Soon
- maybe redis and/or sql databases built in
- more

## migration
- **NOTE: migrating back to the original is not possible**, so make first a **backup** before migration, so you can use the backup to switch back
- if you use custom certificates, you need to upload the CA/Intermediate Certificate (file name: `chain.pem`) in the `/opt/npm/tls/custom/npm-[certificate-id]` folder
- some buttons have changed, check if they are still correct
- please delete all dnspod certs and recreate them OR you manually change the credentialsfile (see [here](https://github.com/ZoeyVid/npmplus/blob/develop/global/certbot-dns-plugins.js) for the template)
- since this fork has dependency on `network_mode: host`, please don't forget to open port 80 and 443 (and maybe 81) in your firewall

# Crowdsec
1. Install crowdsec using this compose file: https://github.com/ZoeyVid/NPMplus/blob/develop/compose.crowdsec.yaml
2. open `/opt/crowdsec/conf/acquis.d/appsec.yaml` and fill it with:
```yaml
listen_addr: 0.0.0.0:7422
appsec_config: crowdsecurity/virtual-patching
name: myAppSecComponent
source: appsec
labels:
  type: appsec
```
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
```
4. make sure to use `network_mode: host` in your compose file
5. run `docker exec crowdsec cscli bouncers add npmplus -o raw` and save the output
6. open `/opt/npm/etc/crowdsec/crowdsec.conf`
7. set `ENABLED` to `true`
8. use the output of step 5 as `API_KEY`
9. save the file
10. set LOGROTATE to `true` in your `compose.yaml
11. redeploy the `compose.yaml`

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
    include conf.d/include/acme-challenge.conf;
    alias /var/www/<your-html-site-folder-name>/;
}
```
b) Custom Nginx Configuration (advanced tab), which looks the following for file server and **php**:
- Note: the slash at the end of the file path is important
- Note: first enable `PHP81`, `PHP82` and/or `PHP83` inside your compose file
- Note: you can replace `fastcgi_pass php81;` with `fastcgi_pass` `php82`/`php83` `;`
- Note: to add more php extension using envs you can set in the compose file
```
location / {
    include conf.d/include/acme-challenge.conf;
    alias /var/www/<your-html-site-folder-name>/;

    location ~ [^/]\.php(/|$) {
        fastcgi_pass php81;
        fastcgi_split_path_info ^(.+?\.php)(/.*)$;
        if (!-f $document_root$fastcgi_script_name) {
            return 404;
        }
    }
}
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

2. Create a compose.yaml file similar to [this](https://github.com/ZoeyVid/NPMplus/blob/develop/compose.yaml) (or use it as a portainer stack):

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

### prerun patches/scripts (EXPERT option) - if you don't know what this is, ignore it

run order: entrypoint.sh (patches => scripts) => start.sh => launch.sh <br>
if you need to apply patches before NPMplus launches put them under: `/opt/npm/etc/prerun/patches/*.patch` (applied using `patch -p1`) <br>
if you need to run scripts before NPMplus launches put them under: `/opt/npm/etc/prerun/scripts/*.sh` (please add `#!/bin/sh` / `#!/bin/bash` to the top of the script) <br>
you need to create this folders yourself, they will be launches from the `/` folder - **NOTE:** I won't help you creating thoose patches/scripts if you need them you also need to know how to create them

## Contributing

All are welcome to create pull requests for this project, against the `develop` branch.

CI is used in this project. All PR's must pass before being considered. After passing,
docker builds for PR's are available on ghcr for manual verifications.

## Contributors/Sponsor upstream NPM

Special thanks to [all of our contributors](https://github.com/NginxProxyManager/nginx-proxy-manager/graphs/contributors).
If you want to sponsor them, please see [here](https://github.com/NginxProxyManager/nginx-proxy-manager/blob/master/README.md).


# Please report Bugs first to this fork before reporting them to the upstream Repository

## Getting Support

1. [Found a bug?](https://github.com/ZoeyVid/NPMplus/issues)
2. [Discussions](https://github.com/ZoeyVid/NPMplus/discussions)
<!---
3. [Reddit](https://reddit.com/r/nginxproxymanager)
--->
