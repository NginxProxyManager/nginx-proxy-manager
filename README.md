![Nginx Proxy Manager](https://public.jc21.com/nginx-proxy-manager/github.png "Nginx Proxy Manager")

# Nginx Proxy Manager

![Version](https://img.shields.io/badge/version-2.0.0-green.svg?style=for-the-badge)
![Stars](https://img.shields.io/docker/stars/jc21/nginx-proxy-manager.svg?style=for-the-badge)
![Pulls](https://img.shields.io/docker/pulls/jc21/nginx-proxy-manager.svg?style=for-the-badge)

**NOTE: Version 2 is a work in progress. Not all of the areas are complete and is definitely not ready for production use.**

This project comes as a pre-built docker image that enables you to easily forward to your websites
running at home or otherwise, including free SSL, without having to know too much about Nginx or Letsencrypt.

 
## Features

- TBD


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
3. Configure your domain name details to point to your home, either with a static ip or a service like DuckDNS
4. Use the Nginx Proxy Manager here as your gateway to forward to your other web based services

