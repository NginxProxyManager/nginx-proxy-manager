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

## After Upgrading

After upgrading to a new version of NGINX Proxy Manager, any config templates that have been modified will not be automatically applied to any existing hosts. This is to avoid a large number of hosts being re-generated on startup. For any hosts that you would like to update, you can simply edit the host in the UI and click the "Save" button without making any changes. This will trigger the new templates to be applied to the host as well as rename any applicable log files.
