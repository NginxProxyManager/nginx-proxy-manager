<p align="center">
	<img src="https://nginxproxymanager.com/github.png">
	<br><br>
	<img src="https://img.shields.io/badge/version-2.9.19+-green.svg?style=for-the-badge">
	<a href="https://hub.docker.com/r/zoeyvid/nginx-proxy-manager">
		<img src="https://img.shields.io/docker/stars/zoeyvid/nginx-proxy-manager.svg?style=for-the-badge">
	</a>
	<a href="https://hub.docker.com/r/zoeyvid/nginx-proxy-manager">
		<img src="https://img.shields.io/docker/pulls/zoeyvid/nginx-proxy-manager.svg?style=for-the-badge">
	</a>
</p>


This project comes as a pre-built docker image that enables you to easily forward to your websites
running at home or otherwise, including free SSL, without having to know too much about Nginx or Letsencrypt.

- [Quick Setup](#quick-setup)
- [Screenshots](https://nginxproxymanager.com/screenshots)


## Project Goal

I created this project to fill a personal need to provide users with a easy way to accomplish reverse
proxying hosts with SSL termination and it had to be so easy that a monkey could do it. This goal hasn't changed.
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


# New Features

- HTTP/3 (QUIC) Support if you enable HTTP/2 (can not be enabled separate)
- Fix Proxy Hosts, if origin only accepts TLSv1.3
- Only use TLSv1.2 and TLSv1.3
- Uses OCSP Stapling
  - Needs manual migration if you use custom certificates, just upload the CA/Intermediate Certificate (file name: `chain.pem`) in the `/opt/npm/custom_ssl/npm-[certificate-id]` folder
- Smaller then the original
- Runs the admin interface on port 81 with ssl (https)
- Default page runs also with ssl (https)
- Uses [fancyindex](https://gitHub.com/Naereen/Nginx-Fancyindex-Theme) if you use the npm directly as webserver
- Expose INTERNAL backend api only to localhost
- Easy security headers, see [here](https://github.com/GetPageSpeed/ngx_security_headers), enabled by default if you enable hsts
- Access Log disabled
- Error Log written to console

## Soon
- more
- I will try to create a pr to contribute to the original project

## Hosting your home network

I won't go in to too much detail here but here are the basics for someone new to this self-hosted world.

1. Your home router will have a Port Forwarding section somewhere. Log in and find it
2. Add port forwarding for port 80 and 443 to the server hosting this project
3. Configure your domain name details to point to your home, either with a static ip or a service like DuckDNS or [Amazon Route53](https://github.com/jc21/route53-ddns)
4. Use the Nginx Proxy Manager as your gateway to forward to your other web based services

## Quick Setup

1. Install Docker and Docker Compose

- [Docker Install documentation](https://docs.docker.com/engine)
- [Docker Compose Install documentation](https://docs.docker.com/compose/install/linux)

2. Create a compose.yaml file similar to this:

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
        - "/opt/npm-letsencrypt:/etc/letsencrypt" # Only needed for first time migration from original nginx-proxy-manager to this fork
        - "/var/www:/var/www" # optional, if you want to use it as webserver for html
        environment:
        - "TZ=Europe/Berlin"
#        - "NGINX_LOG_NOT_FOUND=true" # Allow logging of 404 errors
#        - "NPM_LISTEN_LOCALHOST=true" # Bind the NPM Dashboard on Port 81 only to localhost
```

3. Bring up your stack by running
```bash
docker compose up -d
```

4. Log in to the Admin UI

When your docker container is running, connect to it on port `81` for the admin interface.
Sometimes this can take a little bit because of the entropy of keys.

[https://127.0.0.1:81](https://127.0.0.1:81)

Default Admin User:
```
Email:    admin@example.com
Password: 9KcvfmAvcVonB7YOMqdjJGsTG2JL058Rx6xFNMintAeaGETsRBRlSbfXdi1inoCa
```

Immediately after logging in with this default user you will be asked to modify your details and change your password.


## Contributors

Special thanks to [all of our contributors](https://github.com/NginxProxyManager/nginx-proxy-manager/graphs/contributors).


# Please report Bugs first to this fork before reporting them to the original Repository

## Getting Support

1. [Found a bug?](https://github.com/ZoeyVid/nginx-proxy-manager/issues)
2. [Discussions](https://github.com/ZoeyVid/nginx-proxy-manager/discussions)
<!---
3. [Development Gitter](https://gitter.im/nginx-proxy-manager/community)
4. [Reddit](https://reddit.com/r/nginxproxymanager)
--->
