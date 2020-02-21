![Nginx Proxy Manager](https://public.jc21.com/nginx-proxy-manager/github.png "Nginx Proxy Manager")

# Nginx Proxy Manager

![Version](https://img.shields.io/badge/version-2.1.1-green.svg?style=for-the-badge)
![Stars](https://img.shields.io/docker/stars/jc21/nginx-proxy-manager.svg?style=for-the-badge)
![Pulls](https://img.shields.io/docker/pulls/jc21/nginx-proxy-manager.svg?style=for-the-badge)

[![Build Status](https://ci.nginxproxymanager.jc21.com/buildStatus/icon?job=nginx-proxy-manager%2Fmaster&style=flat-square)](https://ci.nginxproxymanager.jc21.com/job/nginx-proxy-manager/job/master/)

This project comes as a pre-built docker image that enables you to easily forward to your websites
running at home or otherwise, including free SSL, without having to know too much about Nginx or Letsencrypt.


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


## Screenshots

[![Login](https://public.jc21.com/nginx-proxy-manager/v2/small/login.jpg "Login")](https://public.jc21.com/nginx-proxy-manager/v2/large/login.jpg)
[![Dashboard](https://public.jc21.com/nginx-proxy-manager/v2/small/dashboard.jpg "Dashboard")](https://public.jc21.com/nginx-proxy-manager/v2/large/dashboard.jpg)
[![Proxy Hosts](https://public.jc21.com/nginx-proxy-manager/v2/small/proxy-hosts.jpg "Proxy Hosts")](https://public.jc21.com/nginx-proxy-manager/v2/large/proxy-hosts.jpg)
[![Proxy Host Settings](https://public.jc21.com/nginx-proxy-manager/v2/small/proxy-hosts-new1.jpg "Proxy Host Settings")](https://public.jc21.com/nginx-proxy-manager/v2/large/proxy-hosts-new1.jpg)
[![Proxy Host SSL](https://public.jc21.com/nginx-proxy-manager/v2/small/proxy-hosts-new2.jpg "Proxy Host SSL")](https://public.jc21.com/nginx-proxy-manager/v2/large/proxy-hosts-new2.jpg)
[![Redirection Hosts](https://public.jc21.com/nginx-proxy-manager/v2/small/redirection-hosts.jpg "Redirection Hosts")](https://public.jc21.com/nginx-proxy-manager/v2/large/redirection-hosts.jpg)
[![Redirection Host Settings](https://public.jc21.com/nginx-proxy-manager/v2/small/redirection-hosts-new1.jpg "Redirection Host Settings")](https://public.jc21.com/nginx-proxy-manager/v2/large/redirection-hosts-new1.jpg)
[![Streams](https://public.jc21.com/nginx-proxy-manager/v2/small/streams.jpg "Streams")](https://public.jc21.com/nginx-proxy-manager/v2/large/streams.jpg)
[![Stream Settings](https://public.jc21.com/nginx-proxy-manager/v2/small/streams-new1.jpg "Stream Settings")](https://public.jc21.com/nginx-proxy-manager/v2/large/streams-new1.jpg)
[![404 Hosts](https://public.jc21.com/nginx-proxy-manager/v2/small/dead-hosts.jpg "404 Hosts")](https://public.jc21.com/nginx-proxy-manager/v2/large/dead-hosts.jpg)
[![404 Host Settings](https://public.jc21.com/nginx-proxy-manager/v2/small/dead-hosts-new1.jpg "404 Host Settings")](https://public.jc21.com/nginx-proxy-manager/v2/large/dead-hosts-new1.jpg)
[![Certificates](https://public.jc21.com/nginx-proxy-manager/v2/small/certificates.jpg "Certificates")](https://public.jc21.com/nginx-proxy-manager/v2/large/certificates.jpg)
[![Lets Encrypt Certificates](https://public.jc21.com/nginx-proxy-manager/v2/small/certificates-new1.jpg "Lets Encrypt Certificates")](https://public.jc21.com/nginx-proxy-manager/v2/large/certificates-new1.jpg)
[![Custom Certificates](https://public.jc21.com/nginx-proxy-manager/v2/small/certificates-new2.jpg "Custom Certificates")](https://public.jc21.com/nginx-proxy-manager/v2/large/certificates-new2.jpg)
[![Access Lists](https://public.jc21.com/nginx-proxy-manager/v2/small/access-lists.jpg "Access Lists")](https://public.jc21.com/nginx-proxy-manager/v2/large/access-lists.jpg)
[![Access List Users](https://public.jc21.com/nginx-proxy-manager/v2/small/access-lists-new1.jpg "Access List Users")](https://public.jc21.com/nginx-proxy-manager/v2/large/access-lists-new1.jpg)
[![Users](https://public.jc21.com/nginx-proxy-manager/v2/small/users.jpg "Users")](https://public.jc21.com/nginx-proxy-manager/v2/large/users.jpg)
[![User Permissions](https://public.jc21.com/nginx-proxy-manager/v2/small/users-permissions.jpg "User Permissions")](https://public.jc21.com/nginx-proxy-manager/v2/large/users-permissions.jpg)
[![Audit Log](https://public.jc21.com/nginx-proxy-manager/v2/small/audit-log.jpg "Audit Log")](https://public.jc21.com/nginx-proxy-manager/v2/large/audit-log.jpg)


## Getting started

Please consult the [installation instructions](doc/INSTALL.md) for a complete guide or
if you just want to get up and running in the quickest time possible, grab all the files in the `doc/example/` folder and run `docker-compose up -d`


## Administration

When your docker container is running, connect to it on port `81` for the admin interface.

[http://localhost:81](http://localhost:81)

Note: Requesting SSL Certificates won't work until this project is accessible from the outside world, as explained below.


### Default Administrator User

```
Email:    admin@example.com
Password: changeme
```

Immediately after logging in with this default user you will be asked to modify your details and change your password.


## Hosting your home network

I won't go in to too much detail here but here are the basics for someone new to this self-hosted world.

1. Your home router will have a Port Forwarding section somewhere. Log in and find it
2. Add port forwarding for port 80 and 443 to the server hosting this project
3. Configure your domain name details to point to your home, either with a static ip or a service like DuckDNS or [Amazon Route53](https://github.com/jc21/route53-ddns)
4. Use the Nginx Proxy Manager as your gateway to forward to your other web based services


## Nginx Proxy Manager in the wild

As this software gains popularity it's common to see it integrated with other platforms. Please be aware that unless specifically mentioned in the documenation of those
integrations, they are *not supported* by me and any donation links on the pages of those integrations will not come to me even though it looks like it.

Known integrations:

- [HomeAssistant Hass.io plugin](https://github.com/hassio-addons/addon-nginx-proxy-manager)
- [UnRaid / Synology](https://github.com/jlesage/docker-nginx-proxy-manager)
