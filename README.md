![Nginx Proxy Manager](https://public.jc21.com/nginx-proxy-manager/github.png "Nginx Proxy Manager")

# Nginx Proxy Manager

![Version](https://img.shields.io/badge/version-1.1.1-green.svg)
![Stars](https://img.shields.io/docker/stars/jc21/nginx-proxy-manager.svg)
![Pulls](https://img.shields.io/docker/pulls/jc21/nginx-proxy-manager.svg)

![Build Status](http://bamboo.jc21.com/plugins/servlet/wittified/build-status/AB-NPM)

This project comes as a pre-built docker image that enables you to easily forward to your websites
running at home or otherwise, including free SSL, without having to know too much about Nginx or Letsencrypt.

 
## Features

- Clean and simple interface
- Create an unlimited number of hosts and forward them to any IPv4/Port combination running HTTP
- Secure your sites with SSL and optionally force SSL
- Secure your sites with Basic HTTP Authentication Access Lists
- Advanced Nginx config option for super users
- 3 domain uses:
  - Proxy requests to upstream server
  - Redirect requests to another domain
  - Return immediate 404's


## Using [Rancher](https://rancher.com)?

Easily start an Nginx Proxy Manager Stack by adding [my template catalog](https://github.com/jc21/rancher-templates).


## Getting started

### Method 1: Using docker-compose

By far the easiest way to get up and running. Create this `docker-compose.yml`

```yml
version: "2"
services:
  app:
    image: jc21/nginx-proxy-manager
    restart: always
    ports:
      - 80:80
      - 81:81
      - 443:443
    volumes:
      - ./config:/config
      - ./letsencrypt:/etc/letsencrypt
```

Then:

```bash
docker-compose up -d
```


### Method 2: Using vanilla docker

```bash
docker run -d \
    -p 80:80 \
    -p 81:81 \
    -p 443:443 \
    -v /path/to/config:/config \
    -v /path/to/letsencrypt:/etc/letsencrypt \
    --restart always \
    jc21/nginx-proxy-manager
```


## Administration

Now that your docker container is running, connect to it on port `81` for the admin interface.

[http://localhost:81](http://localhost:81)

There is no authentication on this interface to keep things simple. It is expected that you would not
expose port 81 to the outside world.

From here, the rest should be self explanatory.

Note: Requesting SSL Certificates won't work until this project is accessible from the outside world, as explained below.


## Hosting your home network

I won't go in to too much detail here but here are the basics for someone new to this self-hosted world.

1. Your home router will have a Port Forwarding section somewhere. Log in and find it
2. Add port forwarding for port 80 and 443 to the server hosting this project
3. Configure your domain name details to point to your home, either with a static ip or a service like DuckDNS
4. Use the Nginx Proxy Manager here as your gateway to forward to your other web based services


## Screenshots

[![Screenshot](https://public.jc21.com/nginx-proxy-manager/npm-1-sm.jpg "Screenshot")](https://public.jc21.com/nginx-proxy-manager/npm-1.jpg)
[![Screenshot](https://public.jc21.com/nginx-proxy-manager/npm-2-sm.jpg "Screenshot")](https://public.jc21.com/nginx-proxy-manager/npm-2.jpg)
[![Screenshot](https://public.jc21.com/nginx-proxy-manager/npm-3-sm.jpg "Screenshot")](https://public.jc21.com/nginx-proxy-manager/npm-3.jpg)
[![Screenshot](https://public.jc21.com/nginx-proxy-manager/npm-4-sm.jpg "Screenshot")](https://public.jc21.com/nginx-proxy-manager/npm-4.jpg)

## TODO

- Pass on human readable ssl cert errors to the ui
- UI: Allow column sorting on tables
- UI: Allow filtering hosts by types
- Advanced option to overwrite the default location block (or regex to do it automatically)
- Add nice upstream error pages
