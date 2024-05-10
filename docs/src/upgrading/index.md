---
outline: deep
---

# Upgrading

```bash
docker compose pull
docker compose up -d
```

This project will automatically update any databases or other requirements so you don't have to follow
any crazy instructions. These steps above will pull the latest updates and recreate the docker
containers.

See the [list of releases](https://github.com/NginxProxyManager/nginx-proxy-manager/releases) for any upgrade steps specific to each release.
