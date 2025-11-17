# NPMplus

This is an improved fork of the nginx-proxy-manager, see below for some changes <br>
If you don't need the web GUI of NPMplus, you may also have a look at caddy: https://caddyserver.com

- [Compatibility (to Upstream)](#compatibility-to-upstream)
- [Quick Setup](#quick-setup)
- [Migration from upstream/vanilla nginx-proxy-manager](#migration-from-upstreamvanilla-nginx-proxy-manager)

**Note: remember to expose udp/quic for the https port (443/upd)** <br>
**Note: remember to add your domain to the [hsts preload list](https://hstspreload.org) if you enabled hsts for your domain.** <br>
**Note: please report issues first to this fork before reporting them to the upstream repository.** <br>

## List of new features

- Supports HTTP/3 (QUIC) protocol, requires you to expose https with udp
- Supports CrowdSec IPS. Please see [here](https://github.com/ZoeyVid/NPMplus#crowdsec) to enable it
- Goaccess included, see compose.yaml to enable, runs by default on `https://<ip>:91` (nginx config from [here](https://github.com/xavier-hernandez/goaccess-for-nginxproxymanager/blob/main/resources/nginx/nginx.conf))
- Supports ModSecurity (which tends to overblocking, so not recommended), with coreruleset as an option. You can configure ModSecurity/coreruleset by editing the files in the `/opt/npmplus/modsecurity` folder (no support from me, you need to write the rules yourself - for CoreRuleSet I can try to help you)
  - By default NPMplus UI does not work when you proxy NPMplus through NPMplus and you have CoreRuleSet enabled, see below
  - ModSecurity by default blocks uploads of big files, you need to edit its config to fix this, but it can use a lot of resources to scan big files by ModSecurity
  - ModSecurity overblocking (403 Error) when using CoreRuleSet? Please see [here](https://coreruleset.org/docs/concepts/false_positives_tuning) and edit the `/opt/npmplus/modsecurity/crs-setup.conf` file
    - Try to whitelist the Content-Type you are sending (for example, `application/activity+json` for Mastodon and `application/dns-message` for DoH)
    - Try to whitelist the HTTP request method you are using (for example, `PUT` is blocked by default, which also blocks NPMplus UI)
  - CoreRuleSet plugins are supported, you can find a guide in this readme
- Option to load the openappsec attachment module, see compose.yaml for details
- Load balancing possible (requires custom configuration), see below
- Only enables TLSv1.2 and TLSv1.3 protocols, also ML-KEM support
- Faster creation of TLS certificates is achieved by eliminating unnecessary nginx reloads and configuration creations
- Supports OCSP Stapling/Must-Staple for enhanced security (manual certs not supported, see compose.yaml for details)
- Resolved dnspod plugin issue
  - To migrate manually, delete all dnspod certs and recreate them OR change the credentials file as per the template given [here](https://github.com/ZoeyVid/NPMplus/blob/develop/global/certbot-dns-plugins.js)
- Smaller docker image based on alpine linux
- Admin backend interface runs with https
- Default page also runs with https
- Option to change default TLS cert
- Option to use fancyindex if used as webserver
- Exposes INTERNAL backend api only to localhost
- Basic security headers are added if you enable HSTS (HSTS has always subdomains and preload enabled)
- access.log is disabled by default, unified and moved to `/opt/npmplus/nginx/access.log`
- Error Log written to console
- `Server` response header hidden
- PHP optional, with option to add extensions; available packages can added using envs in the compose file, recommended to be used together with PUID/PGID
- Allows different acme servers using env
- Supports Brotli compression
- punycode domain support
- HTTP/2 always enabled with fixed upload
- Allows infinite upload size (may be limited if you use ModSecurity)
- Automatic database vacuum (only sqlite)
- Automatic cleaning of old invalid certbot certs (set CLEAN to true)
- Password reset (only sqlite) using `docker exec -it npmplus password-reset.js USER_EMAIL PASSWORD`
- See the compose file for all available options
- Many env options optimized for network_mode host (ports/ip bindings)
- Allow port range in streams and $server_port as a valid input
- Improved regex checks for inputs
- Merge of upstreams OIDC PR
- DNS secrets are not mounted anymore, since they are saved in the db and rewritten on every container start, so they don't need to be mounted
- Fixed smaller issues/bugs
- Other small changes/improvements

## Compatibility (to Upstream)
- Supported architectures: x86_64-v2/amd64v2 (check with `/lib/ld-linux-x86-64.so.2 --help`, plain x86-64 is not supported only v2 and up) and aarch64/arm64 (other archs (including 64-bit ones) and any 32-bit arch (like armhf/armv7 (dropped), armel/armv6) are not supported, because of the duration to compile).
- I test NPMplus with docker, but podman should also work (I disrecommend you to run the NPMplus container inside an LXC container, it will work, but please don't do it, it will work better without, install docker/podman on the host or in a KVM and run NPMplus with this)
- MariaDB(/MySQL)/PostgreSQL may work as Databases for NPMplus (configuration like in upstream), but are unsupported, have no advantage over SQLite (at least with NPMplus) and are not recommended. Please note that you can't migrate from any of these to SQLite without making a fresh install and copying everything yourself.
- NPMplus uses https instead of http for the admin interface
- NPMplus won't trust cloudflare until you set the env SKIP_IP_RANGES to false, but please read [this](#notes-on-cloudflare) first before setting the env to true.
- route53 is not supported as dns-challenge provider and Amazon CloudFront IPs can't be automatically trusted in NPMplus, even if you set SKIP_IP_RANGES env to false.
- The following certbot dns plugins have been replaced, which means that certs using one of these proivder will not renew and need to be recreated (not renewed): `certbot-dns-he`, `certbot-dns-dnspod`, `certbot-dns-online` and `certbot-dns-do` (`certbot-dns-do` was replaced in upstream with v2.12.4 and then merged into NPMplus)

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
5. Log in to the Admin UI <br>
When your docker container is running, connect to the admin interface using `https://` on port `81`. <br>
Default Admin User Email: `admin@example.org` <br>
The initial unique admin password will be logged to the NPMplus docker logs, you should change it

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
9. Since many buttons have changed, please check if they are still correct for every host you have.
10. If you proxy NPM(plus) through NPM(plus) make sure to change the scheme from http to https
11. Maybe setup crowdsec (see below)
12. Please report all (migration) issues you may have

# Crowdsec
<!--Note: Using Immich behind NPMplus with enabled appsec causes issues, see here: [#1241](https://github.com/ZoeyVid/NPMplus/discussions/1241) <br>-->
Note: If you don't [disable sharing in crowdsec](https://docs.crowdsec.net/docs/next/configuration/crowdsec_configuration/#sharing), you may need to mention that [this](https://docs.crowdsec.net/docs/central_api/intro/#signal-meta-data) is sent to crowdsec in your privacy policy.
1. Install crowdsec and the ZoeyVid/npmplus collection for example by using crowdsec container at the end of the compose.yaml, you may also want to install [this](https://app.crowdsec.net/hub/author/crowdsecurity/collections/http-dos), but be warned of false positives
2. Set LOGROTATE to `true` in your `compose.yaml` and redeploy
3. Open `/opt/crowdsec/conf/acquis.d/npmplus.yaml` (path may be different depending how you installed crowdsec) and fill it with:
```yaml
filenames:
  - /opt/npmplus/nginx/*.log
labels:
  type: npmplus
---
filenames:
  - /opt/npmplus/nginx/*.log
labels:
  type: modsecurity
---
listen_addr: 0.0.0.0:7422
appsec_config: crowdsecurity/appsec-default
name: appsec
source: appsec
labels:
  type: appsec
# if you use openappsec you can enable this
#---
#source: file
#filenames:
# - /opt/openappsec/logs/cp-nano-http-transaction-handler.log*
#labels:
#  type: openappsec
```
4. Make sure to use `network_mode: host` in your compose file for the NPMplus container
5. Run `docker exec crowdsec cscli bouncers add npmplus -o raw` and save the output
6. Open `/opt/npmplus/crowdsec/crowdsec.conf`
7. Set `ENABLED` to `true`
8. Use the output of step 5 as `API_KEY`
9. Save the file
10. Redeploy the `compose.yaml`
11. It is recommended to block at the earliest possible point, so if possible set up a firewall bouncer: https://docs.crowdsec.net/u/bouncers/firewall, make sure to also include the docker iptables in the firewall bouncer config

## Coreruleset plugins
1. Download the plugin (all files inside the `plugins` folder of the git repo), most of the time: `<plugin-name>-before.conf`, `<plugin-name>-config.conf` and `<plugin-name>-after.conf` and sometimes `<plugin-name>.data` and/or `<plugin-name>.lua` or similar files
2. Put them into the `/opt/npmplus/modsecurity/crs-plugins` folder
3. Maybe open the `/opt/npmplus/modsecurity/crs-plugins/<plugin-name>-config.conf` and configure the plugin

## Use of external php-fpm (recommended)
1. Create a new Proxy Host with some dummy data for `Scheme` (like `path`), `Domain/IP/Path` (like `0.0.0.0`) (you can also use other values, since these get fully ignored)
2. Make other settings (like TLS)
3. Put this in the advanced tab and adjust:
```
location / {
    alias /var/www/<your-html-site-folder-name>/; # or use the "root" directive of the line below
    #root /var/www/<your-html-site-folder-name>; # or use the "alias" directive of the line above
    #fancyindex off; # alternative to nginx "index" option (looks better and has more options)
    location ~* \.php(?:$|/) {
      fastcgi_split_path_info ^(.*\.php)(/.*)$;
      try_files $fastcgi_script_name =404;
      fastcgi_pass ...; # set this to the address of your php-fpm (socket/tcp): https://nginx.org/en/docs/http/ngx_http_fastcgi_module.html#fastcgi_pass
    }
}
```

## Use of inbuilt php-fpm (not recommended)
1. First enable php inside your compose file (you can add more php extension using envs in the compose file)
2. Set the forwarding port to the php version you want to use and is supported by NPMplus (like 82/83/84)

## Load Balancing
1. Open and edit this file: `/opt/npmplus/custom_nginx/http_top.conf` (or `/opt/npmplus/custom_nginx/stream_top.conf` for streams), if you changed /opt/npmplus to a different path make sure to change the path to fit
2. Set the upstream directive(s) with your servers which should be load balanced (https://nginx.org/en/docs/http/ngx_http_upstream_module.html / https://nginx.org/en/docs/stream/ngx_stream_upstream_module.html), they need to run the same protocol (either http(s) or grpc(s) for proxy hosts or tcp/udp/proxy protocol for streams), like this for example:
```
# a) at least one backend uses a different port, optionally the one external server is marked as backup
upstream server1 {
    server 127.0.0.1:44;
    server 127.0.0.1:33;
    server 127.0.0.1:22;
    server 192.158.168.11:44 backup;
}
# b) all services use the same port
upstream service2 {
    server 192.158.168.14;
    server 192.158.168.13;
    server 192.158.168.12;
    server 192.158.168.11;
}
```
3. Configure your proxy host/stream like always in the UI, but set the hostname to service1 (or service2 or however you named it), if you followed example a) you need to keep the forward port field empty (since you set the ports within the upstream directive), for b) you need to set it

## Prerun scripts (EXPERT option) - if you don't know what this is, ignore it
If you need to run scripts before NPMplus launches put them under: `/opt/npmplus/prerun/*.sh` (please add `#!/usr/bin/env sh` / `#!/usr/bin/env bash` to the top of the script) you need to create this folder yourself, also set the `ENABLE_PRERUN` env to `true`

## Examples of implementing some services using auth_request

### Anubis config (supported)
1. The anubis env "TARGET" should be set to a single space "` `" and in you policy file the "status_codes" should be set to 401 and 403, like this:
```yaml
status_codes:
  CHALLENGE: 401
  DENY: 403
```
2. Create a custom location / (or the location you want to use), set your proxy settings, then press the gear button and paste the following in the new text field:
```
auth_request /.within.website/x/cmd/anubis/api/check;
error_page 401 403 =200 /.within.website/?redir=$request_uri;
```
3. Create a location with the path `/.within.website`, this should proxy to your anubis, example: `http://127.0.0.1:8923`, then press the gear button and paste the following in the new text field
```
proxy_method GET;
proxy_pass_request_body off;
proxy_set_header Content-Length "";
```

### Tinyauth config example (some support)
1. Create a custom location / (or the location you want to use), set your proxy settings, then press the gear button and paste the following in the new text field, you need to adjust the last line:
```
auth_request /tinyauth;
error_page 401 =302 http://tinyauth.example.com/login?redirect_uri=$scheme://$host$request_uri;
```
2. Create a location with the path `/tinyauth`, this should proxy to your tinyauth, example: `http://<ip>:<port>/api/auth/nginx`, then press the gear button and paste the following in the new text field
```
internal;
proxy_method GET;
proxy_pass_request_body off;
proxy_set_header Content-Length "";
```

### Authelia config example (limited support)
1. Create a custom location / (or the location you want to use), set your proxy settings, then press the gear button and paste the following in the new text field:
```
auth_request /internal/authelia/authz;
auth_request_set $redirection_url $upstream_http_location;
error_page 401 =302 $redirection_url;

auth_request_set $user $upstream_http_remote_user;
auth_request_set $groups $upstream_http_remote_groups;
auth_request_set $name $upstream_http_remote_name;
auth_request_set $email $upstream_http_remote_email;

proxy_set_header Remote-User $user;
proxy_set_header Remote-Groups $groups;
proxy_set_header Remote-Email $email;
proxy_set_header Remote-Name $name;
```
2. Create a location with the path `/internal/authelia/authz`, this should proxy to your authelia, example `http://127.0.0.1:9091/api/authz/auth-request`, then press the gear button and paste the following in the new text field
```
internal;
proxy_method GET;
proxy_pass_request_body off;
proxy_set_header Content-Length "";
```

### Authentik config example (very limited support)
1. create a custom location / (or the location you want to use), set your proxy settings, then press the gear button and paste the following in the new text field, you may need to adjust the last lines:
```
auth_request /outpost.goauthentik.io/auth/nginx;
error_page 401 = @goauthentik_proxy_signin;

auth_request_set $auth_cookie $upstream_http_set_cookie;
add_header Set-Cookie $auth_cookie;

auth_request_set $authentik_username $upstream_http_x_authentik_username;
auth_request_set $authentik_groups $upstream_http_x_authentik_groups;
auth_request_set $authentik_entitlements $upstream_http_x_authentik_entitlements;
auth_request_set $authentik_email $upstream_http_x_authentik_email;
auth_request_set $authentik_name $upstream_http_x_authentik_name;
auth_request_set $authentik_uid $upstream_http_x_authentik_uid;

proxy_set_header X-authentik-username $authentik_username;
proxy_set_header X-authentik-groups $authentik_groups;
proxy_set_header X-authentik-entitlements $authentik_entitlements;
proxy_set_header X-authentik-email $authentik_email;
proxy_set_header X-authentik-name $authentik_name;
proxy_set_header X-authentik-uid $authentik_uid;

# This section should be uncommented when the "Send HTTP Basic authentication" option is enabled in the proxy provider
#auth_request_set $authentik_auth $upstream_http_authorization;
#proxy_set_header Authorization $authentik_auth;
```
2. Create a location with the path `/outpost.goauthentik.io`, this should proxy to your authentik, examples: `https://127.0.0.1:9443/outpost.goauthentik.io` for embedded outpost (or `https://127.0.0.1:9443` for manual outpost deployments), then press the gear button and paste the following in the new text field
```
auth_request_set $auth_cookie $upstream_http_set_cookie;
add_header Set-Cookie $auth_cookie;
proxy_method GET;
proxy_pass_request_body off;
proxy_set_header Content-Length "";
```
3. Paste the following in the advanced config tab, you may need to adjust the last lines:
```
location @goauthentik_proxy_signin {
  internal;
  add_header Set-Cookie $auth_cookie;
  return 302 /outpost.goauthentik.io/start?rd=$request_uri;
  ## For domain level, use the below error_page to redirect to your authentik server with the full redirect path
  #return 302 https://authentik.company/outpost.goauthentik.io/start?rd=$scheme://$host$request_uri;
}
```

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
- to gravatar for profile pictures
- to github for a daily update check
- if used to pypi to download certbot plugins
- if used to your dns provider for acme dns challenges
- if used to www.site24x7.com for the reachability check
- if enabled to cloudflare to download theier IPs
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
