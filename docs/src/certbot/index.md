---
outline: deep
---

## Certbot DNS plugins in Nginx Proxy Manager

Nginx Proxy Manager uses Certbot to issue and renew Let’s Encrypt certificates.

When you request a certificate using a DNS challenge, Nginx Proxy Manager installs
the corresponding Certbot DNS plugin for the provider you selected. The available
providers and package versions are defined in
⁠[certbot-dns-plugins.json](https://github.com/NginxProxyManager/nginx-proxy-manager/blob/develop/backend/certbot/dns-plugins.json).

## Important limitations

DNS plugins are maintained independently from Certbot and from Nginx Proxy Manager. As a result:
- Some plugins may lag behind current Certbot or dependency versions.
- A plugin may install package versions that conflict with other Certbot components.
- Support quality varies between providers, and not every plugin is regularly tested in Nginx Proxy Manager.

::: warning
Using more than one DNS provider in the same Nginx Proxy Manager instance may introduce Python
dependency conflicts between Certbot plugins.
:::

## If a DNS plugin does not work

1. Check the Nginx Proxy Manager container logs for Certbot or Python package installation errors.
2. Identify the plugin package and version defined for your provider in
⁠[certbot-dns-plugins.json](https://github.com/NginxProxyManager/nginx-proxy-manager/blob/develop/backend/certbot/dns-plugins.json).
3. Check [PyPI](https://pypi.org/) or the plugin project for a newer compatible release.
4. If needed, update the plugin definition, including any required dependency pins.
5. Submitting a pull request and CI will build a testable docker image for you.

## File reference

Use this file when reviewing or updating provider definitions:
- ⁠[certbot-dns-plugins.json](https://github.com/NginxProxyManager/nginx-proxy-manager/blob/develop/backend/certbot/dns-plugins.json)
