# NPMplus

If you don't need the web GUI of NPMplus, you may also have a look at caddy: https://caddyserver.com

- [Compatibility (to Upstream)](#compatibility-to-upstream)
- [Quick Setup](#quick-setup)
- [Migration from upstream/vanilla nginx-proxy-manager](#migration-from-upstreamvanilla-nginx-proxy-manager)

**Note: this fork is distributed under the GNU Affero General Public License version 3. It is based on the MIT licensed [nginx-proxy-manager](https://github.com/NginxProxyManager/nginx-proxy-manager).** <br>
**Note: by running NPMplus you agree to the TOS of Let's Encrypt/your custom CA.** <br>
**Note: remember to expose udp/quic for the https port (443/udp).** <br>
**Note: remember to add your domain to the [hsts preload list](https://hstspreload.org) if you enabled hsts for your domain.** <br>
**Note: please report issues first to this fork before reporting them to the upstream repository.** <br>

## List of some changes

- Supports HTTP/3 (QUIC), requires you to expose https with udp
- Support for crowdsec and openappsec
- Support for acme profiles (letsencrypt shortlived is used by default)
- Improved support for different acme servers (like ocsp/must-staple)
- OIDC support
- smaller image based on alpine
- ML-KEM support (also hardened TLS settings enforced)
- https for the NPMplus interface
- Goaccess included
- punycode domain support
- zstd and brotli
- basic security headers always send
- allow empty ports to support loadbalancing
- proxy protocol support
- improved nginx build and nginx templates
- file and php server support (and fancyindex)
- option to edit custom certs
- gravatars are cached locally and fetched by the backend (better privacy by not exposing you directly to gravatar)
- qrcodes for totp are generated locally in your browser instead of using a third-party api (better privacy/security by not exposing you and the secret to the third-party api)
- re-added some things that where removed with upstreams new frontend
- use secure cookied instead of local storage to save the token
- Password reset (only sqlite) using `docker exec -it npmplus password-reset.js USER_EMAIL PASSWORD`
- many other things, see this README.md and the compose.yaml

## Compatibility (to Upstream)
- Supported architectures: x86_64-v2/amd64v2 (check with `/lib/ld-linux-x86-64.so.2 --help`, plain x86-64 is not supported only v2 and up) and aarch64/arm64 (other archs (including 64-bit ones) and any 32-bit arch (like armhf/armv7 (dropped), armel/armv6) are not supported, because of the duration to compile).
- I test NPMplus with docker, but podman should also work (I disrecommend you to run the NPMplus container inside an LXC container, it will work, but please don't do it, it will work better without, install docker/podman on the host or in a KVM and run NPMplus with this)
- MariaDB(/MySQL)/PostgreSQL may work as Databases for NPMplus (configuration like in upstream), but are unsupported, have no advantage over SQLite (at least with NPMplus) and are not recommended. Please note that you can't migrate from any of these to SQLite without making a fresh install and/or copying everything yourself.
- NPMplus uses https instead of http for the admin interface
- NPMplus won't trust cloudflare until you set the env TRUST_CLOUDFLARE to true, but please read [this](#notes-on-cloudflare) first before setting the env to true.
- route53 is not supported as dns-challenge provider and Amazon CloudFront IPs can't be automatically trusted in NPMplus, even if you set TRUST_CLOUDFLARE env to true.
- The following certbot dns plugins have been replaced, which means that certs using one of these proivder will not renew and need to be recreated (not renewed): `certbot-dns-he`, `certbot-dns-dnspod`, `certbot-dns-online`, `certbot-dns-powerdns` and `certbot-dns-do` (`certbot-dns-do` was replaced in upstream with v2.12.4 and then merged into NPMplus)
- There are many changed and improvements to the nginx config, so please don't follow guides in the internet about custom/advanced config, they are either redundant or should not be used at all with NPMplus
- Many forms have changed behavior, see [Comments on some buttons](#comments-on-some-buttons)

## Quick Setup
1. Install Docker and Docker Compose (podman or docker rootless may also work)
- [Docker Install documentation](https://docs.docker.com/engine/install)
- [Docker Compose Install documentation](https://docs.docker.com/compose/install/linux)
2. Download this [compose.yaml](https://raw.githubusercontent.com/ZoeyVid/NPMplus/refs/heads/develop/compose.yaml) (or use its content as a portainer stack)
3. Adjust TZ and ACME_EMAIL to your values and maybe adjust other env options to your needs
4. Start NPMplus by running (or deploy your portainer stack)
```bash
docker compose up -d
```
5. Log in to the Admin UI: When your docker container is running, connect to the admin interface using `https://` on port `81`.

## Migration from upstream/vanilla nginx-proxy-manager
- **NOTE: Migrating back to the original version is not possible.** Please make a **backup** before migrating, so you have the option to revert if needed
1. Please read [this](#compatibility-to-upstream) first
2. make a backup of your data and letsencrypt folders (creating a copy using `cp -a` should be enough)
3. download the latest compose.yaml of NPMplus
4. adjust your paths (of /etc/letsencrypt and /data) to the ones you used with nginx-proxy-manager
5. adjust TZ and ACME_EMAIL to your values and maybe adjust other env options to your needs
6. stop nginx-proxy-manager
7. deploy the NPMplus compose.yaml
8. You should now remove the `/etc/letsencrypt` mount, since it was moved to `/data` while migration, then redeploy the compose file
9. Since many forms have changed, please check if they are still correct for every host you have.
10. If you proxy NPM(plus) through NPM(plus) make sure to change the scheme from http to https
11. Because of a added CSP-rules gravatar images will not load, to fix this you need to open the form to edit a users name and save it without changes
12. Maybe setup crowdsec (see below)
13. Please report all (migration) issues you may have

# Crowdsec
<!--Note: Using Immich behind NPMplus with enabled appsec causes issues, see here: [#1241](https://github.com/ZoeyVid/NPMplus/discussions/1241) <br>-->
Note: If you don't [disable sharing in crowdsec](https://docs.crowdsec.net/docs/next/configuration/crowdsec_configuration/#sharing), you may need to mention that [this](https://docs.crowdsec.net/docs/central_api/intro/#signal-meta-data) is sent to crowdsec in your privacy policy.
1. Install crowdsec and the ZoeyVid/npmplus collection for example by using crowdsec container at the end of the compose.yaml, you may also want to install [this](https://app.crowdsec.net/hub/author/crowdsecurity/collections/http-dos), but be warned of false positives
2. Set LOGROTATE to `true` in your `compose.yaml` and redeploy
3. Open `/opt/crowdsec/conf/acquis.d/npmplus.yaml` (path may be different depending how you installed crowdsec) and fill it with:
```yaml
filenames:
  - /opt/npmplus/nginx/logs/*.log
labels:
  type: npmplus
---
listen_addr: 0.0.0.0:7422
appsec_config: crowdsecurity/appsec-default
name: appsec
source: appsec
labels:
  type: appsec
#---
# If you use open-appsec, uncomment the section below.
# If connecting to open-appsec cloud, you must edit the default 'log trigger' 
# in the cloud dashboard: check "Log to > gateway / agent" and click 'enforce'.
# Otherwise, no intrusion events will be logged to the local agent 
# for CrowdSec to process.
#source: file
#filenames:
# - /opt/openappsec/logs/cp-nano-http-transaction-handler.log*
#labels:
#  type: openappsec
```
4. Make sure to use `network_mode: host` in your compose file for the NPMplus container
5. Run `docker exec crowdsec cscli bouncers add npmplus` and save the api key of the output
6. Open `/opt/npmplus/crowdsec/crowdsec.conf`
7. Set `ENABLED` to `true`
8. Use the output of step 5 as `API_KEY`
9. Save the file
10. Redeploy the `compose.yaml`
11. It is recommended to block at the earliest possible point, so if possible set up a firewall bouncer: https://docs.crowdsec.net/u/bouncers/firewall, make sure to also include the docker iptables in the firewall bouncer config
12. Note that when using crowdsec requests will always be buffered, so setting `proxy_(request_)buffering` to off will not work

## Use of external php-fpm (recommended)
1. Create a new Proxy Host with some dummy data in the details tab (since these get fully ignored)
2. Make other settings (like TLS)
3. Create a custom location `/` set the scheme to `path`, put in the path, the press the gear button and fill this in (edit the last line):
```
location ~* [^/]\.php(?:$|/) {
  fastcgi_split_path_info ^(.*\.php)(/.*)$;
  try_files $fastcgi_script_name =404;
  fastcgi_pass ...; # set this to the address of your php-fpm (socket/tcp): https://nginx.org/en/docs/http/ngx_http_fastcgi_module.html#fastcgi_pass
}
```

## Use of inbuilt php-fpm (not recommended)
1. First enable php inside your compose file (you can add more php extension using envs in the compose file)
2. Set the forwarding port to the php version you want to use and is supported by NPMplus (like 83/84/85)

## Comments on some buttons
- Forward Hostname / IP / Path: if the scheme is set to path you can just put here a path in and nginx works as a file server, otherwise you need to input ip/domain, you can also append a path to the ip/domain like `127.0.0.1/path` to proxy to a subpath.
  - For custom locations with a set path, dns will be only refreshed on nginx reloads and the path of the location will be stripped. So a request `GET /cdf/abc` to a custom location `/cdf` which proxies to `127.0.0.1/abc` will proxy to `127.0.0.1/abc/abc`, a custom location `/cdf/` which proxies to `127.0.0.1/` will proxy to `127.0.0.1/abc`  and a custom location `/cdf` which proxies to `127.0.0.1` will proxy to `127.0.0.1/cdf/abc`
  - If the scheme is set to `path`, a path ending with a `/` will be searched relative to the custom location (is uses nginx alias) and a path ending without a `/` will be searched relative to the main `/` location (it uses nginx root)
- Forward Port (optional): port of upstream or php version if scheme is `path`
- Send noindex header and block some user agents: This does what is says, it appends a header to all responses which says that the site should not be indexed while blocking requests of crawlers based on the user agent sent with the request
- Disable Crowdsec Appsec: this will disable crowdsec appsec only for one host/one location, this will only do something if appsec is configured
- Disable Response Buffering: Most time you want keep buffering enabled, you may want to disable this if you for example want to stream videos and you have a fast and stable connection to the upstream server, this effects the connection from the upstream server to NPMplus
- Disable Request Buffering: Most time you want keep buffering enabled, request buffering will always be enabled if crowdsec appsec is enabled, you may want to disable this if you for example want to upload huge files and have a fast and stable connection to the upstream server, this effects the connection from the NPMplus to the upstream server
- Enable compression by upstream: this will allow the backend to compress files, I recommend you to keep this disabled, there may be cases where this is needed since otherwise the upstream missbehaves for some reason (like collabora in nextcloud all-in-one)
- Enable fancyindex: this will enabled fancyindex, which shows a index of all files in the folder if there is no index file, only enable this if you know what you are doing and you need the index
- Websockets: this button was removed, websockets are now always enabled
- Reuse Key: this will make the new cert always keep its key unless you force renew it, I recommend you to keep this disabled (not to keep the key), a reason to keep the key would be TLSA/pubkey pinning
- TLS to upstream (for Streams): This can be used if your stream target already uses tls but you want to override it with a NPMplus cert, do not enable if you don't set a new cert, since this will downgrade the connecting to be unencrypted
- X-Frame-Options: will control the X-Frame-Options header, none will remove the header, SAMEORIGIN/DENY will set it to these values and upstream will keep what upstream sends

## Examples of implementing some services using auth_request

### Anubis
1. Deploy an anubis container (see the compose.yaml for an example and information)
2. In the mounted anubis bot policy file the "status_codes" should be set to 401 and 403, like this:
```yaml
status_codes:
  CHALLENGE: 401
  DENY: 403
```
3. Set the AUTH_REQUEST_ANUBIS_UPSTREAM env in the NPMplus compose.yaml and select anubis in the Auth Request selection, no custom/advanced config/locations needed
4. You can override the "allow", "checking" and "blocked" images used by default by setting the `AUTH_REQUEST_ANUBIS_USE_CUSTOM_IMAGES` env to true and putting put your custom images as happy.webp, pensive.webp and reject.webp to /opt/npmplus/anubis

### Tinyauth
1. Set the AUTH_REQUEST_TINYAUTH_UPSTREAM and AUTH_REQUEST_TINYAUTH_DOMAIN env in the NPMplus compose.yaml and select tinyauth in the Auth Request selection, no custom/advanced config/locations needed

### Authelia (modern)
1. Set the AUTH_REQUEST_AUTHELIA_UPSTREAM env in the NPMplus compose.yaml and select authelia (modern) in the Auth Request selection, no custom/advanced config/locations needed

### Authentik
1. Set the AUTH_REQUEST_AUTHENTIK_UPSTREAM env (and optional AUTH_REQUEST_AUTHENTIK_DOMAIN env if you use the "domain level" variant in authentik, do not set this env if you use the "single application" variant) in the NPMplus compose.yaml and select authentik/authentik-send-basic-auth in the Auth Request selection, no custom/advanced config/locations needed

## Load Balancing
1. Open and edit this file: `/opt/npmplus/custom_nginx/http_top.conf` (or `/opt/npmplus/custom_nginx/stream_top.conf` for streams), if you changed /opt/npmplus to a different path make sure to change the path to fit
2. Set the upstream directive(s) with your servers which should be load balanced (https://nginx.org/en/docs/http/ngx_http_upstream_module.html / https://nginx.org/en/docs/stream/ngx_stream_upstream_module.html), they need to run the same protocol (either http(s) or grpc(s) for proxy hosts or tcp/udp/proxy protocol for streams), like this for example:
```
upstream server1 {
  server 127.0.0.1:44;
  server 127.0.0.1:33;
  server 127.0.0.1:22;
  server 192.158.168.11:44 backup;
}
```
3. Configure your proxy host/stream like always in the UI, but set the hostname to service1 (or service2 or however you named it) and keep the forward port field empty (since you set the ports within the upstream directive)

## Geoblocking example (mainly community support) 

1. set the `NGINX_LOAD_GEOIP2_MODULE` env to true and redeploy NPMplus
2. deploy a geoipupdate container (see the compose.yaml for an example, create credentials [here](https://www.maxmind.com/en/geolite2/signup))
3. open and edit this file: `/opt/npmplus/custom_nginx/http_top.conf`, if you changed /opt/npmplus to a different path make sure to change the path to fit
```yaml
geoip2 /data/goaccess/geoip/GeoLite2-Country.mmdb {
  auto_reload 60m;
  $geoip2_country_iso_code country iso_code;
}

# whitelist example, you can add as many country codes as you want, country code list: https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2#XY
#map $geoip2_country_iso_code $geoip2_country_rule {
#  default no;
#  AA yes;
#  XY yes;
#  '' yes; # if you want to allow IPs with unknown country codes, if you don't do this make sure to allow private IPs
#}

# blacklist example, you can add as many country codes as you want, country code list: https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2#XY
#map $geoip2_country_iso_code $geoip2_country_rule {
#  default yes;
#  AA no;
#  XY no;
#  '' no; # if you want to block IPs with unknown country codes, if you do this make sure to allow private IPs
#}

# uncomment if you block/don't allow IPs with unknown country codes
#geo $is_private_ip {
#  default no;
#  127.0.0.0/8 yes;
#  10.0.0.0/8 yes;
#  172.16.0.0/12 yes;
#  192.168.0.0/16 yes;
#  169.254.0.0/16 yes;
#  ::1/128 yes;
#  fc00::/7 yes;
#  fec0::/10 yes;
#}
```  
4a. to set it per location: create a custom location / (or the location you want to use), set your proxy settings, then press the gear button and paste the following in the new text field, you may want to adjust the last lines (do not use the advanced tab with this example as it may break cert renewals):
```yaml
# uncomment if you block/don't allow IPs with unknown country codes
#if ($is_private_ip = yes) { 
#  set $geoip2_country_rule yes; 
#} 
if ($geoip2_country_rule = no) { 
  return 444; # this rejects the connection, but you can also return 403 to tell the client that it was denied
} 
```
4b. to set it for an entire host: put this in the advanced tab:
```yaml
# uncomment if you block/don't allow IPs with unknown country codes
#if ($is_private_ip = yes) { 
#  set $geoip2_country_rule yes; 
#}
if ($request_uri ~* "^/\.well-known/acme-challenge/") {
    set $geoip2_country_rule yes;
}
if ($geoip2_country_rule = no) { 
  return 444; # this rejects the connection, but you can also return 403 to tell the client that it was denied
} 
```
4c. to set it for all http hosts of them same type: put this in the `custom_nginx/server_proxy.conf` / `custom_nginx/server_redirect.conf` / `custom_nginx/server_dead.conf` file(s):
```yaml
# uncomment if you block/don't allow IPs with unknown country codes
#if ($is_private_ip = yes) { 
#  set $geoip2_country_rule yes; 
#}
if ($request_uri ~* "^/\.well-known/acme-challenge/") {
    set $geoip2_country_rule yes;
}
if ($geoip2_country_rule = no) { 
  return 444; # this rejects the connection, but you can also return 403 to tell the client that it was denied
} 
```
4d. to set it for all http hosts: put this in the `custom_nginx/server_http.conf` file:
```yaml
# uncomment if you block/don't allow IPs with unknown country codes
#if ($is_private_ip = yes) { 
#  set $geoip2_country_rule yes; 
#}
if ($request_uri ~* "^/\.well-known/acme-challenge/") {
    set $geoip2_country_rule yes;
}
if ($geoip2_country_rule = no) { 
  return 444; # this rejects the connection, but you can also return 403 to tell the client that it was denied
} 
```
5. you can create multiple rule lists by adding multiple map directive, but you need to use a unique name instead of `$geoip2_country_rule` for each rule list (you need the unique name also in the custom locations)

## Prerun scripts (EXPERT option) - if you don't know what this is, ignore it
If you need to run scripts before NPMplus launches put them under: `/opt/npmplus/prerun/*.sh` (please add `#!/usr/bin/env sh` / `#!/usr/bin/env bash` to the top of the script) you need to create this folder yourself, also set the `ENABLE_PRERUN` env to `true`

## Notes on Cloudflare
- I strongly advise against using cloudflare proxy/tunnel before NPMplus (so between the users and NPMplus `users <=> cloudflare <=> NPMplus`)
- Why?
  - cloudflare acts like a "man in the middle" (if you want you can also call it a "wanted man-in-the-middle attack"), this means all traffic going from your users to you/from you to your users will be decrypted by cloudflare before being encrypted again and being forwarded to you/your users, if you want this is your decision (security, privacy, etc.)
  - many optimizations done by NPMplus will because of this only be used between cloudflare and NPMplus, so your users won't notice them
  - cloudflare overrides many things done/configured by NPMplus (like headers (including HSTS), HTTP/3 (QUIC), TLS settings and more), so you might need to configure them again in Cloudflare, but this is not always possible
  - cloudflare has a limit of 100MB per connection, so uploading/downloading big files my cause problems, if no chunking is used
  - because all data does not take direct way between your users and you, the connection time will increase
  - cloudflare only forwards/protects http(s) traffic on port 80/443 to you, services running on other ports/different protocols are not forwarded/protected (STUN/TURN/SSH)
  - cloudflare can't protect you if the attacker knows your real ip, as cloudflare only rewrites your dns entries to itself and then acts as a reverse proxy, direct ip connectings to you are not protected (use a firewall like ufw, make sure to allow 80/tcp and 443/tcp+udp for NPMplus, if possible don't open SSH and NPMplus GUI to the internet, but secure them behind a VPN like Wireguard)
  - if you need a WAF => use [crowdsec](#crowdsec)
  - if you want to use the "I'm under attack mode" to protect you from (ai) web scrapes => use [anubis](#anubis-config-supported)
- What are reason for cloudflare?
  - The points above don't matter you (enough) and:
    - you depend on a not mentioned and unreplaceable feature of cloudflare
    - or you are under (a) DDoS-attack(s), which you can't handle yourself and the attacker does not know your real ip/does not use it to attack you, but instead your domain: you could use cloudflare as dns nameserver for your domain with the proxy disabled and only enable it if you are under an attack (only work if the attacker did not cache your real ip)
    - or you want to hide your IP and only expose http(s) services, but then: don't use NPMplus at all, install cloudflared and use cloudflare tunnels and point it directly to your upstreams, this way you can still manage everything in a GUI and you don't even need to expose any ports
- If you still want to use cloudflare proxy make sure to set `your domain => SSL/TLS => SSL/TLS encryption => Current encryption mode => Configure` to "Full (strict)"
- Just using cloudflare as a dns nameserver provider for your domain is fine
- If you use cloudflare to forward mails to your inbox, note that cloudflare also acts as man-in-the-middle in this case

## Hints for Your Privacy Policy
**Note: This is not legal advice. The following points are intended to give you hints and help you identify areas that may be relevant to your privacy policy. This list may not be complete or correct.**
1. NPMplus **always** writes the nginx error logs to your Docker logs; it uses the error level “warn” (so every error nginx and the nginx modules mark as error level “warn” or higher will be logged), as it contains user information (like IPs) you should mention it in your privacy policy. With the default installation no user data should leave your system because of NPMplus (except for data sent to your backends, as this is the task of a reverse proxy), this should be the only data created by NPMplus containing user information by default.
2. If you enable `LOGROTATE` the access and error (also level “warn”), logs will be written to your disk and rotated every 25 hours and deleted based on your set number of set rotations. The access logs use these formats: [http](https://github.com/ZoeyVid/NPMplus/blob/c6a2df722390eb3f4377c603e16587fe8c74e54f/rootfs/usr/local/nginx/conf/nginx.conf#L30) and [stream](https://github.com/ZoeyVid/NPMplus/blob/c6a2df722390eb3f4377c603e16587fe8c74e54f/rootfs/usr/local/nginx/conf/nginx.conf#L249). These include user information (like IPs), so make sure to also mention that these exist and what you are doing with them.
3. If you use crowdsec, and you do **not** [disable sharing in crowdsec](https://docs.crowdsec.net/docs/next/configuration/crowdsec_configuration/#sharing), you need to mention that [this](https://docs.crowdsec.net/docs/central_api/intro/#signal-meta-data) is sent to crowdsec in your privacy policy.
4. If you're blocking IPs — for example, using access lists, GeoIP filtering, or CrowdSec block lists — make sure to mention this as well.
5. If GoAccess is enabled, it processes access logs to generate statistics, which are saved on disk for a time you can configure. These statistics include user information (like IPs), so make sure to also mention this.
6. If you use the PHP-FPM option, error logs from PHP-FPM will also be written to Docker logs. These include user information (like IPs), so make sure to also mention this.
7. If you use open-appsec `NGINX_LOAD_OPENAPPSEC_ATTACHMENT_MODULE`, you should also include information about it; since I don't use it myself, I can't give you any further hints.
8. If you collect any user information (like through other custom nginx modules, modules you can load via env, lua scripts, etc.), also mention it.
9. If you use the caddy http to https redirect container, you should also mention the data collected by it, since it will also collect (error) logs.
10. If use use anubis, see here: https://anubis.techaro.lol/docs/admin/configuration/impressum
11. If you do any extra custom/advanced configuration/modification, which is in someway related to the users data, then yes, keep in mind to also mention this.
12. Anything else you do with the users data, should also be mentioned. (Like what your backend does or any other proxies in front of NPMplus (like cloudflare, still not recommended), how data is stored, duration, ads, analytic tools, how data is handled if they contact you, by who/which provider, etc.)
13. I don't think this needs to be mentioned, but you can include it if you want to be thorough (note: this does not apply if you're using Let's Encrypt, as they no longer support OCSP): Some clients (like Firefox) send OCSP requests to the certificate authority (CA) by default if the CA includes OCSP URLs in the certificate. This behavior can be disabled by users in Firefox. In my opinion, it doesn't need to be mentioned, as no data is sent to you — the client communicates directly with the CA. The check is initiated by the client itself; it's neither requested nor required by you. Your certificate simply indicates that the client can perform this check if it chooses to.
14. Also optional and, in my opinion, not required: Some information about the data stored by the nameservers running your domain. I don't think this should be required, since in most cases there's a provider between the users and your nameserver acting as a proxy. This means the DNS requests of your users are hidden behind their provider. It’s the provider who should explain to their users how they handle data in their role as a "DNS proxy."

## What connections can be expected from the NPMplus container?
- to your clients
- to your upstreams
- to your acme/ocsp server
- to github for a daily update check
- if not disabled gravatar for profile pictures
- if used to your OIDC
- if used to pypi to download certbot plugins
- if used to your dns provider for acme dns challenges
- if used to www.site24x7.com for the reachability check
- if enabled to cloudflare to download their IPs
- if enabled to the crowdsec (container) lapi
- if you see more/others please report them

## Features and Project Goal of Upstream
I created this project to fill a personal need to provide users with an easy way to accomplish reverse proxying hosts with TLS termination and it had to be so easy that a monkey could do it. This goal hasn't changed. While advanced configuration options are available, they remain entirely optional. The core idea is to keep things as simple as possible, lowering the barrier to entry for everyone.
- Beautiful and Secure Admin Interface based on [Tabler](https://tabler.github.io)
- Easily create forwarding domains, redirections, streams and 404 hosts without knowing anything about Nginx
- Free trusted TLS certificates using Certbot (Let's Encrypt/other CAs) or provide your own custom TLS certificates
- Access Lists and basic HTTP Authentication for your hosts
- Advanced Nginx configuration available for super users
- User management, permissions and audit log

## Contributing
All are welcome to create pull requests for this project, but this does not mean that they will be merged, so better ask if your PR would be merged before creating one (via Discussion), typos and translation are excluded from this.

# Please report issues first to this fork before reporting them to the upstream repository
## Getting Help
1. [Support/Questions](https://github.com/ZoeyVid/NPMplus/discussions) (preferred)
2. [Discord](https://discord.gg/y8DhYhv427) (only in the #support-npmplus forum channel, keep other channels free from NPMplus)
3. [Reddit](https://reddit.com/r/NPMplus) (not recommended)
4. [Bugs](https://github.com/ZoeyVid/NPMplus/issues) (only for feature requests and reproducible bugs)
