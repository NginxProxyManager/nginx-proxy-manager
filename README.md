<p align="center">
  <img src="https://nginxproxymanager.com/github.png">
  <br><br>
  <img src="https://img.shields.io/badge/version-2.2.1-green.svg?style=for-the-badge">
  <a href="https://hub.docker.com/repository/docker/jc21/nginx-proxy-manager">
    <img src="https://img.shields.io/docker/stars/jc21/nginx-proxy-manager.svg?style=for-the-badge">
  </a>
  <a href="https://hub.docker.com/repository/docker/jc21/nginx-proxy-manager">
    <img src="https://img.shields.io/docker/pulls/jc21/nginx-proxy-manager.svg?style=for-the-badge">
  </a>
  <a href="https://ci.nginxproxymanager.com/blue/organizations/jenkins/nginx-proxy-manager/branches/">
    <img src="https://img.shields.io/jenkins/build?jobUrl=https%3A%2F%2Fci.nginxproxymanager.com%2Fjob%2Fnginx-proxy-manager%2Fjob%2Fmaster&style=for-the-badge">
  </a>
</p>

This project comes as a pre-built docker image that enables you to easily forward to your websites
running at home or otherwise, including free SSL, without having to know too much about Nginx or Letsencrypt.

- [Quick Setup](https://nginxproxymanager.com#quick-setup)
- [Full Setup](https://nginxproxymanager.com/setup/)
- [Screenshots](https://nginxproxymanager.com/screenshots/)

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


## Hosting your home network

I won't go in to too much detail here but here are the basics for someone new to this self-hosted world.

1. Your home router will have a Port Forwarding section somewhere. Log in and find it
2. Add port forwarding for port 80 and 443 to the server hosting this project
3. Configure your domain name details to point to your home, either with a static ip or a service like DuckDNS or [Amazon Route53](https://github.com/jc21/route53-ddns)
4. Use the Nginx Proxy Manager as your gateway to forward to your other web based services
