# NPMplus

This is an improved fork of the nginx-proxy-manager and comes as a pre-built docker image that enables you to easily forward to your websites running at home or otherwise, including free TLS, without having to know too much about Nginx or Certbot. <br>
If you don't need the web GUI of NPMplus, you may also have a look at caddy: https://caddyserver.com

- [Quick Setup](#quick-setup)

**Note: no armv7/armhf, no route53 and no aws cloudfront ip ranges support.** <br>
**Note: other Databases like MariaDB/MySQL or PostgreSQL may work, but are unsupported, have no advantage over SQLite and are not recommended.** <br>
**Note: remember to expose udp for the https port and to add your domain to the hsts preload list if you use security headers: https://hstspreload.org** <br>

## Upstream Project Goal
I created this project to fill a personal need to provide users with an easy way to accomplish reverse
proxying hosts with TLS termination and it had to be so easy that a monkey could do it. This goal hasn't changed.
While there might be advanced options they are optional and the project should be as simple as possible
so that the barrier for entry here is low.

## Upstream Features

- Beautiful and Secure Admin Interface based on [Tabler](https://tabler.github.io)
- Easily create forwarding domains, redirections, streams and 404 hosts without knowing anything about Nginx
- Free trusted TLS certificates using Certbot (Let's Encrypt/other CAs) or provide your own custom TLS certificates
- Access Lists and basic HTTP Authentication for your hosts
- Advanced Nginx configuration available for super users
- User management, permissions and audit log


# List of new features

- Supports HTTP/3 (QUIC) protocol, requires you to expose https with udp.
- Supports CrowdSec IPS. Please see [here](https://github.com/ZoeyVid/NPMplus#crowdsec) to enable it.
- goaccess included, see compose.yaml to enable, runs by default on `https://<ip>:91` (nginx config from [here](https://github.com/xavier-hernandez/goaccess-for-nginxproxymanager/blob/main/resources/nginx/nginx.conf))
- Supports ModSecurity (which tends to overblocking), with coreruleset as an option. You can configure ModSecurity/coreruleset by editing the files in the `/opt/npmplus/modsecurity` folder (no support from me, you need to write the rules yourself - for CoreRuleSet I can try to help you).
  - By default NPMplus UI does not work when you proxy NPMplus through NPMplus and you have CoreRuleSet enabled, see below
  - ModSecurity by default blocks uploads of big files, you need to edit its config to fix this, but it can use a lot of resources to scan big files by ModSecurity
  - ModSecurity overblocking (403 Error) when using CoreRuleSet? Please see [here](https://coreruleset.org/docs/concepts/false_positives_tuning) and edit the `/opt/npmplus/modsecurity/crs-setup.conf` file.
    - Try to whitelist the Content-Type you are sending (for example, `application/activity+json` for Mastodon and `application/dns-message` for DoH).
    - Try to whitelist the HTTP request method you are using (for example, `PUT` is blocked by default, which also blocks NPMplus UI).
  - CoreRuleSet plugins are supported, you can find a guide in this readme
- option to load the openappsec attachment module, see compose.yaml for details
- Darkmode button in the footer for comfortable viewing (CSS done by [@theraw](https://github.com/theraw))
- load balancing possible (requires custom configuration), see below
- Only enables TLSv1.2 and TLSv1.3 protocols, also ML-KEM support
- Faster creation of TLS certificates is achieved by eliminating unnecessary nginx reloads and configuration creations.
- Supports OCSP Stapling/Must-Staple for enhanced security (manual certs not supported, see compose.yaml for details)
- Resolved dnspod plugin issue
  - To migrate manually, delete all dnspod certs and recreate them OR change the credentials file as per the template given [here](https://github.com/ZoeyVid/NPMplus/blob/develop/global/certbot-dns-plugins.js)
- Smaller docker image based on alpine linux
- Admin backend interface runs with https
- Default page also runs with https
- option to change default TLS cert
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
- multi lang support, if you want to add an language, see this commit as an example: https://github.com/ZoeyVid/NPMplus/commit/a026b42329f66b89fe1fbe5e6034df5d3fc2e11f (implementation based on [@lateautumn233](https://github.com/lateautumn233) fork)
- See the compose file for all available options
- many env options optimized for network_mode host (ports/ip bindings)
- allow port range in streams and $server_port as a valid input
- improved regex checks for inputs
- merge of upstreams OIDC PR
- dns secrets are not mounted anymore, since they are saved in the db and rewritten on every container start, so they don't need to be mounted
- fixed smaller issues/bugs
- other small changes/improvements

## migration
- **NOTE: migrating back to the original is not possible**, so make first a **backup** before migration, so you can use the backup to switch back
- please delete all certs using dnspod as dns provider and recreate them after migration, since the certbot plugin used was replaced
- stop nginx-proxy-manager download the latest compose.yaml, adjust your paths (of /etc/letsencrypt and /data) to the ones you used with nginx-proxy-manager and adjust the envs of the compose file how you like it and then deploy it
- you can now remove the /etc/letsencrypt mount, since it was moved to /data while migration, and redeploy the compose file
- since many buttons changed, please check if they are still correct for every host you have.
- if you proxy NPM(plus) through NPM(plus) make sure to change the scheme from http to https
- maybe setup crowdsec (see below)
- please report all (migration) issues you may have

# Quick Setup
1. Install Docker and Docker Compose (podman or docker rootless may also work)
- [Docker Install documentation](https://docs.docker.com/engine/install)
- [Docker Compose Install documentation](https://docs.docker.com/compose/install/linux)
2. Download this [compose.yaml](https://raw.githubusercontent.com/ZoeyVid/NPMplus/refs/heads/develop/compose.yaml) (or use its content as a portainer stack)
3. adjust TZ and ACME_EMAIL to your values and maybe adjust other env options to your needs.
4. start NPMplus by running (or deploy your portainer stack)
```bash
docker compose up -d
```
5. Log in to the Admin UI <br>
When your docker container is running, connect to it on port `81` for the admin interface. <br>
Sometimes this can take a little bit because of the entropy of keys. <br>
You may need to open port 81 in your firewall. <br>
You may need to use another IP-Address. <br>
[https://127.0.0.1:81](https://127.0.0.1:81) <br>
Default Admin User Email: `admin@example.org` <br>
The default admin password will be logged to the NPMplus docker logs <br>
Immediately after logging in with this default user you will be asked to modify your details and change your password. <br>

# Crowdsec
Note: Using Immich behind NPMplus with enabled appsec causes issues, see here: [#1241](https://github.com/ZoeyVid/NPMplus/discussions/1241) <br>
Note: If you don't [disable sharing in crowdsec](https://docs.crowdsec.net/docs/next/configuration/crowdsec_configuration/#sharing), you need to mention that [this](https://docs.crowdsec.net/docs/central_api/intro/#signal-meta-data) is sent to crowdsec in your privacy policy.
1. Install crowdsec and the ZoeyVid/npmplus collection for example by using crowdsec container at the end of the compose.yaml
2. set LOGROTATE to `true` in your `compose.yaml` and redeploy
3. open `/opt/crowdsec/conf/acquis.d/npmplus.yaml` (path may be different depending how you installed crowdsec) and fill it with:
```yaml
filenames:
  - /opt/npmplus/nginx/access.log
  - /opt/npmplus/nginx/error.log
labels:
  type: npmplus
---
filenames:
  - /opt/npmplus/nginx/error.log
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
4. make sure to use `network_mode: host` in your compose file
5. run `docker exec crowdsec cscli bouncers add npmplus -o raw` and save the output
6. open `/opt/npmplus/crowdsec/crowdsec.conf`
7. set `ENABLED` to `true`
8. use the output of step 5 as `API_KEY`
9. save the file
10. redeploy the `compose.yaml`

# coreruleset plugins
1. Download the plugin (all files inside the `plugins` folder of the git repo), most time: `<plugin-name>-before.conf`, `<plugin-name>-config.conf` and `<plugin-name>-after.conf` and sometimes `<plugin-name>.data` and/or `<plugin-name>.lua` or somilar files
2. put them into the `/opt/npmplus/modsecurity/crs-plugins` folder
3. maybe open the `/opt/npmplus/modsecurity/crs-plugins/<plugin-name>-config.conf` and configure the plugin

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
    #fancyindex off; # alternative to nginx "index" option (looks better and has more options)
}
```
b) Custom Nginx Configuration (advanced tab), which looks the following for file server and **php**:
- Note: the slash at the end of the file path is important
- Note: first enable `PHP82`, `PHP83` and/or `PHP84` inside your compose file
- Note: you can replace `fastcgi_pass php82;` with `fastcgi_pass php83;`/`fastcgi_pass php84;`
- Note: to add more php extension using envs you can set in the compose file
```
location / {
    alias /var/www/<your-html-site-folder-name>/;
    #fancyindex off; # alternative to nginx "index" option (looks better and has more options)
    location ~ [^/]\.php(/|$) {
        fastcgi_pass php82;
        fastcgi_split_path_info ^(.+?\.php)(/.*)$;
        if (!-f $document_root$fastcgi_script_name) {
            return 404;
        }
    }
}
```

# Load Balancing
1. open and edit this file: `/opt/npmplus/custom_nginx/http_top.conf` (or `/opt/npmplus/custom_nginx/stream_top.conf` for streams), if you changed /opt/npmplus to a different path make sure to change the path to fit
2. set the upstream directive(s) with your servers which should be load balanced (https://nginx.org/en/docs/http/ngx_http_upstream_module.html / https://nginx.org/en/docs/stream/ngx_stream_upstream_module.html), they need to run the same protocol (either http or https or tcp/udp for streams), like this for example:
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
3. configure your proxy host/stream like always in the UI, but set the hostname to service1 (or service2 or however you named it), if you followed example a) you need to keep the forward port field empty (since you set the ports within the upstream directive), for b) you need to set it

## anubis config
1. the anubis env "TARGET" should be set to a single space ` `/" " and in you policy file the "status_codes" should be set to 401 and 403, like this:
```yaml
status_codes:
  CHALLENGE: 401
  DENY: 403
```
2. create a custom location / (or the location you want to use), set your proxy settings, then press the gear button and paste the following in the new text field:
```
auth_request /.within.website/x/cmd/anubis/api/check;
error_page 401 403 =200 /.within.website/?redir=$request_uri;
```
3. create a location with the path `/.within.website`, this should proxy to your anubis, example: `http://127.0.0.1:8923`, then press the gear button and paste the following in the new text field
```
proxy_method GET;
proxy_pass_request_body off;
proxy_set_header Content-Length "";
```

## authentik config example (limited support)
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
2. create a location with the path `/outpost.goauthentik.io`, this should proxy to your authentik, examples: `https://127.0.0.1:9443/outpost.goauthentik.io` for embedded outpost (or `https://127.0.0.1:9443` for manual outpost deployments), then press the gear button and paste the following in the new text field
```
auth_request_set $auth_cookie $upstream_http_set_cookie;
add_header Set-Cookie $auth_cookie;
proxy_method GET;
proxy_pass_request_body off;
proxy_set_header Content-Length "";
```
3. paste the following in the advanced config tab, you may need to adjust the last lines:
```
location @goauthentik_proxy_signin {
  internal;
  add_header Set-Cookie $auth_cookie;
  return 302 /outpost.goauthentik.io/start?rd=$request_uri;
  ## For domain level, use the below error_page to redirect to your authentik server with the full redirect path
  #return 302 https://authentik.company/outpost.goauthentik.io/start?rd=$scheme://$host$request_uri;
}
```

## authelia config example (limited support)
1. create a custom location / (or the location you want to use), set your proxy settings, then press the gear button and paste the following in the new text field:
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
2. create a location with the path `/internal/authelia/authz`, this should proxy to your authelia, example `http://127.0.0.1:9091/api/authz/auth-request`, then press the gear button and paste the following in the new text field
```
internal;
proxy_method GET;
proxy_pass_request_body off;
proxy_set_header Content-Length "";
```

## tinyauth config example (limited support)
1. create a custom location / (or the location you want to use), set your proxy settings, then press the gear button and paste the following in the new text field, you need to adjust the last line:
```
auth_request /tinyauth;
error_page 401 =302 http://tinyauth.example.com/login?redirect_uri=$scheme://$host$request_uri;
```
2. create a location with the path `/tinyauth`, this should proxy to your tinyauth, example: `http://<ip>:<port>/api/auth/nginx`, then press the gear button and paste the following in the new text field
```
internal;
proxy_method GET;
proxy_pass_request_body off;
proxy_set_header Content-Length "";
```

## Hints for Your Privacy Policy
**Note: This is not legal advice. The following points are intended to give you hints and help you identify areas that may be relevant to your privacy policy. This list may not be complete or correct.**
1. NPMplus **always** writes the nginx error logs to your Docker logs; it uses the error level “warn” (so every error nginx and the nginx modules mark as error level “warn” or higher will be logged), as it contains user information (like IPs) you should mention it in your privacy policy. With the default installation no user data should leave your system because of NPMplus (except for data sent to your backends, as this is the task of a reverse proxy), this should be the only data created by NPMplus containing user information by default.
2. If you enable `LOGROTATE` the access and error (also level “warn”) logs will be written to your disk and rotated every 25 hours and deleted based on your set number of set rotations. The access logs use these formats: [http](https://github.com/ZoeyVid/NPMplus/blob/c6a2df722390eb3f4377c603e16587fe8c74e54f/rootfs/usr/local/nginx/conf/nginx.conf#L30) and [stream](https://github.com/ZoeyVid/NPMplus/blob/c6a2df722390eb3f4377c603e16587fe8c74e54f/rootfs/usr/local/nginx/conf/nginx.conf#L249). These include user information (like IPs), so make sure to also mention that these exist and what you are doing with them.
3. If you use crowdsec, and you do **not** [disable sharing in crowdsec](https://docs.crowdsec.net/docs/next/configuration/crowdsec_configuration/#sharing), you need to mention that [this](https://docs.crowdsec.net/docs/central_api/intro/#signal-meta-data) is sent to crowdsec in your privacy policy.
4. If you block IPs like for example through access lists, geoip and/or crowdsec block lists, then you may also need to be mention this.
5. If GoAccess is enabled, it processes access logs to generate statistics, which are saved on disk for a time you can configure. These statistics include user information (like IPs), so make sure to also mention this.
6. If you use the PHP-FPM option, error logs from PHP-FPM will also be written to Docker logs. These include user information (like IPs), so make sure to also mention this.
7. If you use open-appsec `NGINX_LOAD_OPENAPPSEC_ATTACHMENT_MODULE`, you should also include information about it; since I don't use it myself, I can't give you further hints.
8. If you collect any user information (like through other custom nginx modules, modules you can load via env, lua scripts, ...), also mention it.
10. If you use the caddy http to https redirect container, you should also mention the data collected by it, since it will also collect (error) logs.
11. If use use anubis, see here: https://anubis.techaro.lol/docs/admin/configuration/impressum
12. If you do any extra custom/advanced configuration/modification, which is in someway related to the users data, then yes, keep in mind to also mention this.
13. Anything else you do with the users data, should also be mentioned. (Like what you backend does or any other proxies in front of NPMplus, how data is stored, how long, ads, analytic tools, how data is handled if they contact your, etc.)
14. I think this does not need to be mentioned, but you can mention it if you want to be sure (does not apply if you use letsencrypt, they don't support OCSP anymore): some clients (like firefox) send OCSP requests to your CA by default if the CA adds OCSP-URLs to your cert (can be disabled by the users in firefox), I think this does not need to be mentioned as no data goes to you, but directly to the CA and the client initiates this check by itself and is not ask or required by you to do this, your cert just says the the client can check this if it wants
15. Also optional and should no be required, I think: some information about the data saved by the nameservers running your domain, should not be required I think, since nearly always there is a provider between the users and your nameserver which acts like a proxy so the dns requests of your users will be hidden as theier provider, which instead should explain theier users how they handle data as "dns proxy"

## prerun scripts (EXPERT option) - if you don't know what this is, ignore it
if you need to run scripts before NPMplus launches put them under: `/opt/npmplus/prerun/*.sh` (please add `#!/usr/bin/env sh` / `#!/usr/bin/env bash` to the top of the script) you need to create this folder yourself, also enable the env

## Contributing
All are welcome to create pull requests for this project, but this does not mean it will be merged.

# Please report Bugs first to this fork before reporting them to the upstream Repository
## Getting Help
1. [Support/Questions](https://github.com/ZoeyVid/NPMplus/discussions)
2. [Discord](https://discord.gg/y8DhYhv427)
3. [Reddit](https://reddit.com/r/NPMplus)
4. [Bugs](https://github.com/ZoeyVid/NPMplus/issues)
